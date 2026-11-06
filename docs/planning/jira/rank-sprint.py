#!/usr/bin/env python3
"""Rank existing Sprint 1 tasks only; plan is offline, credentials stay in memory."""
import argparse
import base64
import csv
import getpass
import json
import os
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import warnings
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE = 'https://faker1652005.atlassian.net'
BOARD = 1
SPRINT_NAME = 'CoLearnia Sprint 1'
FIELDS = 'summary,description,labels,parent,assignee,priority,timeoriginalestimate,status,issuelinks,sprint'


def rows(name):
    with (ROOT / name).open(encoding='utf-8-sig', newline='') as stream:
        return list(csv.DictReader(stream))


def load_plan():
    plan = rows('sprint-1-rank.csv')
    expected = {r['Jira key']: r['Source ID'] for r in rows('jira-key-mapping.csv')}
    metadata = {r['Source ID']: r for r in rows('task-mapping.csv')}
    keys = [r['Jira key'] for r in plan]
    if len(keys) != 80 or len(set(keys)) != 80 or set(keys) != set(expected):
        raise ValueError('Rank phải chứa đúng 80 key đã nhập, không trùng/thiếu/thừa.')
    for i, row in enumerate(plan, 1):
        if row['Position'] != str(i) or row['Source ID'] != expected[row['Jira key']]:
            raise ValueError('Vị trí hoặc mã WBS không khớp mapping.')
        meta = metadata[row['Source ID']]
        for column, source in [('Executor', 'Executor domain'), ('Priority', 'Priority'),
                               ('Wave', 'Wave'), ('Hours', 'Hours')]:
            if row[column] != meta[source]:
                raise ValueError(f"{row['Jira key']}: metadata lệch nguồn.")
    positions = {key: i for i, key in enumerate(keys)}
    links = rows('sprint-1-jira-links.csv')
    pairs = {(r['Provider Jira key'], r['Consumer Jira key']) for r in links}
    if len(links) != 171 or len(pairs) != 171:
        raise ValueError('Nguồn phụ thuộc phải có đúng 171 cặp duy nhất.')
    for link in links:
        if positions[link['Provider Jira key']] >= positions[link['Consumer Jira key']]:
            raise ValueError('Rank đặt consumer trước provider; cần review danh sách.')
    return plan


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Jira:
    def __init__(self, email, token):
        self.authorization = 'Basic ' + base64.b64encode(f'{email}:{token}'.encode()).decode()
        self.opener = urllib.request.build_opener(NoRedirect)
        self.issue_ids = {}
        self.reconcile_ids = []

    def request(self, path, body=None):
        # Hard allowlist: no generic issue/sprint updates, creates or deletes.
        if body is not None and path != '/rest/agile/1.0/issue/rank':
            raise ValueError('Chỉ cho phép PUT tới endpoint Rank.')
        req = urllib.request.Request(
            SITE + path, method='GET' if body is None else 'PUT',
            data=None if body is None else json.dumps(body).encode(),
            headers={'Authorization': self.authorization, 'Accept': 'application/json',
                     'Content-Type': 'application/json', 'Cache-Control': 'no-cache'},
        )
        try:
            with self.opener.open(req, timeout=30) as response:
                if response.status != (200 if body is None else 204):
                    raise RuntimeError(f'HTTP {response.status}: chưa xác nhận thành công; chạy check, không tự thử ghi lại.')
                data = response.read()
                return json.loads(data) if data else None
        except urllib.error.HTTPError as exc:
            raise RuntimeError(f'Jira HTTP {exc.code}; dừng. Kiểm quyền/token, hoặc thử lại sau nếu 429/5xx.') from None
        except (urllib.error.URLError, TimeoutError):
            raise RuntimeError('Timeout/mất kết nối; PUT có thể đã thành công. Chạy check trước khi tiếp tục.') from None

    def setup(self):
        config = self.request(f'/rest/agile/1.0/board/{BOARD}/configuration')
        self.rank_field = int(config['ranking']['rankCustomFieldId'])
        start, matches = 0, []
        while True:
            page = self.request(f'/rest/agile/1.0/board/{BOARD}/sprint?state=active,future&startAt={start}&maxResults=50')
            matches.extend(s for s in page['values'] if s['name'] == SPRINT_NAME)
            if page.get('isLast'):
                break
            if not page['values']:
                raise RuntimeError('Không đọc đủ danh sách sprint; dừng.')
            start += len(page['values'])
        if len(matches) != 1:
            raise RuntimeError('Không tìm thấy duy nhất CoLearnia Sprint 1 đang future/active trên board 1.')
        self.sprint_id = int(matches[0]['id'])
        print(f"Board {BOARD}; sprint {self.sprint_id}: {SPRINT_NAME} ({matches[0]['state']}).")

    def issues(self):
        result, seen_tokens, token = [], set(), None
        while True:
            query = {'maxResults': 100, 'fields': FIELDS,
                     'jql': f'ORDER BY cf[{self.rank_field}] ASC'}
            # Enhanced search can lag after a Rank write. Reconcile the latest
            # changed issues/anchors, up to the documented 50-ID limit.
            if self.reconcile_ids:
                query['reconcileIssues'] = self.reconcile_ids
            if token:
                query['nextPageToken'] = token
            page = self.request(
                f'/rest/software/1.0/board/{BOARD}/sprint/{self.sprint_id}/issue?'
                + urllib.parse.urlencode(query, doseq=True))
            result.extend(page['issues'])
            for issue in page['issues']:
                self.issue_ids[issue['key']] = int(issue['id'])
            token = page.get('nextPageToken')
            if not token:
                if page.get('isLast') is False:
                    raise RuntimeError('Thiếu token trang kế tiếp; không coi danh sách là đầy đủ.')
                return result
            if token in seen_tokens:
                raise RuntimeError('Token phân trang lặp; dừng.')
            seen_tokens.add(token)

    def move(self, key, anchor, before=False):
        # Require numeric IDs already read from Jira, never infer them from keys.
        ids = [self.issue_ids[key], self.issue_ids[anchor]]
        self.request('/rest/agile/1.0/issue/rank', {
            'issues': [key], 'rankCustomFieldId': self.rank_field,
            'rankBeforeIssue' if before else 'rankAfterIssue': anchor,
        })
        for issue_id in ids:
            if issue_id in self.reconcile_ids:
                self.reconcile_ids.remove(issue_id)
            self.reconcile_ids.append(issue_id)
        self.reconcile_ids = self.reconcile_ids[-50:]


def validate_remote(issues, plan):
    expected = {r['Jira key']: r['Source ID'] for r in plan}
    keys = [issue['key'] for issue in issues]
    if len(keys) != 80 or len(set(keys)) != 80 or set(keys) != set(expected):
        raise RuntimeError('Sprint phải có đúng 80 task đã mapping. Kiểm quyền xem/sprint; không tự thêm hoặc chuyển ticket.')
    for issue in issues:
        source = expected[issue['key']]
        fields = issue['fields']
        if not fields['summary'].startswith(f'[{source}]') or (
                'source-' + source.lower().replace('.', '-') not in fields['labels']):
            raise RuntimeError(f"{issue['key']}: summary/label không khớp WBS; dừng.")
    return keys


def unchanged(before, after):
    # Fields explicitly requested above exclude rank and updated timestamps.
    def normalize(items):
        return {i['key']: {k: i['fields'].get(k) for k in FIELDS.split(',')} for i in items}
    if normalize(before) != normalize(after):
        raise RuntimeError('Có trường ngoài Rank thay đổi trong lúc chạy; dừng để kiểm Jira/lịch sử, không tự khôi phục.')


def wait_for_rank(jira, plan, prefix, baseline):
    # Retry reads only, never the mutation. Stop immediately on scope/field drift
    # or HTTP/network errors; only an ordering mismatch may be index latency.
    delays = [0, 1, 2, 4, 8, 15]
    for delay in delays:
        if delay:
            print(f'Đang chờ Jira cập nhật Rank; đọc lại sau {delay}s...', flush=True)
            time.sleep(delay)
        actual = jira.issues()
        keys = validate_remote(actual, plan)
        unchanged(baseline, actual)
        if keys[:len(prefix)] == prefix:
            return actual
    print('Đầu danh sách mong đợi: ' + ', '.join(prefix[:10]), flush=True)
    print('Đầu danh sách Jira trả về: ' + ', '.join(keys[:10]), flush=True)
    raise RuntimeError('Đã đọc lại 6 lần nhưng Rank chưa khớp. Không gửi lại PUT; chạy check và kiểm Backlog.')


def reorder(jira, plan, target, baseline):
    for index, key in enumerate(target):
        current_issues = jira.issues()
        current = validate_remote(current_issues, plan)
        unchanged(baseline, current_issues)
        if current[:index] != target[:index]:
            raise RuntimeError('Thứ tự đã xác nhận bị đổi; có thể có người đang rank. Dừng và kiểm lại.')
        if current[index] == key:
            print(f'{index + 1}/{len(target)} {key}: đã đúng vị trí.', flush=True)
            continue
        jira.move(key, current[0] if index == 0 else target[index - 1], before=index == 0)
        wait_for_rank(jira, plan, target[:index + 1], baseline)
        print(f'{index + 1}/{len(target)} {key}: đã xếp và đọc lại.', flush=True)


def save_snapshot(jira, issues):
    # No token, email, headers or complete issue payloads are written.
    fd, name = tempfile.mkstemp(prefix='colearnia-rank-before-', suffix='.json')
    with os.fdopen(fd, 'w', encoding='utf-8') as stream:
        json.dump({'site': SITE, 'boardId': BOARD, 'sprintId': jira.sprint_id,
                   'rankCustomFieldId': jira.rank_field,
                   'order': [i['key'] for i in issues]}, stream, indent=2)
    print(f'Đã lưu thứ tự trước lượt chạy: {name}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=['plan', 'check', 'pilot', 'apply'], default='plan')
    args = parser.parse_args()
    plan = load_plan()
    desired = [r['Jira key'] for r in plan]
    if args.mode == 'plan':
        for r in plan:
            print(f"{r['Position']:>2}. {r['Jira key']} | {r['Source ID']} | {r['Executor']} | {r['Hours']}h")
        print('Local: đủ 80 task, 171 phụ thuộc đúng thứ tự. Không kết nối Jira.')
        return
    email = input('Email Atlassian: ').strip()
    with warnings.catch_warnings():
        warnings.simplefilter('error', getpass.GetPassWarning)
        try:
            token = getpass.getpass('API token (ẩn khi nhập): ').strip()
        except getpass.GetPassWarning:
            raise RuntimeError('Terminal không hỗ trợ nhập ẩn; chạy trong Terminal, không nhập token ở đây.') from None
    if not email or not token:
        raise ValueError('Thiếu email/token.')
    jira = Jira(email, token)
    jira.setup()
    baseline = jira.issues()
    current = validate_remote(baseline, plan)
    mismatch = sum(a != b for a, b in zip(current, desired))
    print(f'Đủ 80 ticket đúng WBS; {mismatch} vị trí khác kế hoạch.')
    print('Năm vị trí đầu hiện tại: ' + ', '.join(current[:5]))
    if args.mode == 'check':
        if current != desired:
            print('Chưa khớp toàn bộ. Pilot đạt: ' + str(current[:5] == desired[:5]))
            sys.exit(2)
        print('PASS: thứ tự đủ 80 task khớp kế hoạch.')
        return
    target = desired[:5] if args.mode == 'pilot' else desired
    if args.mode == 'apply' and current[:5] != desired[:5]:
        raise RuntimeError('Năm task pilot chưa đúng. Chạy pilot và kiểm Backlog trước khi apply.')
    if current[:len(target)] == target:
        print('Thứ tự đã đúng; không ghi thêm.')
        return
    save_snapshot(jira, baseline)
    if input(f'Chỉ đổi Rank cho {len(target)} task đầu; không đổi field khác. Gõ YES: ') != 'YES':
        print('Đã hủy; không ghi Jira.')
        return
    # Catch changes made while the confirmation prompt was open.
    latest = jira.issues()
    if validate_remote(latest, plan) != current:
        raise RuntimeError('Rank thay đổi trong khi chờ xác nhận; chạy lại để đọc trạng thái mới.')
    unchanged(baseline, latest)
    reorder(jira, plan, target, baseline)
    wait_for_rank(jira, plan, target, baseline)
    print('PASS lượt ' + args.mode + '; đã đọc lại Rank và kiểm các trường giữ nguyên.')
    print('Kiểm trên Backlog; sau apply chạy --mode check để đối chiếu toàn bộ.')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, ValueError, KeyError, OSError) as error:
        print(f'DỪNG: {error}', file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print('\nĐã dừng; chạy check trước khi tiếp tục.', file=sys.stderr)
        sys.exit(130)
