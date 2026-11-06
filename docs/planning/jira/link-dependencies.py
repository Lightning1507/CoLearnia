#!/usr/bin/env python3
"""One-off Jira link helper. Credentials are prompted, never persisted."""
import argparse
import base64
import csv
import getpass
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

SITE = 'https://faker1652005.atlassian.net'
DATA = Path(__file__).with_name('sprint-1-jira-links.csv')


def load_pairs():
    with DATA.open(encoding='utf-8-sig', newline='') as stream:
        rows = list(csv.DictReader(stream))
    pairs = [(r['Provider Jira key'], r['Consumer Jira key']) for r in rows]
    if len(pairs) != 171 or len(set(pairs)) != 171:
        raise ValueError('Danh sách phải có đúng 171 cặp duy nhất.')
    for a, b in pairs:
        if a == b or any(not key.startswith('SCRUM-') or not key[6:].isdigit() for key in (a, b)):
            raise ValueError('Mã ticket hoặc chiều liên kết không hợp lệ.')
    return pairs


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Jira:
    def __init__(self, email, token):
        self.authorization = 'Basic ' + base64.b64encode(f'{email}:{token}'.encode()).decode()
        self.opener = urllib.request.build_opener(NoRedirect)

    def request(self, path, body=None):
        req = urllib.request.Request(
            SITE + '/rest/api/3/' + path,
            data=None if body is None else json.dumps(body).encode(),
            headers={'Authorization': self.authorization, 'Accept': 'application/json',
                     'Content-Type': 'application/json'},
            method='GET' if body is None else 'POST',
        )
        try:
            with self.opener.open(req, timeout=30) as response:
                data = response.read()
                return json.loads(data) if data else None
        except urllib.error.HTTPError as exc:
            # Do not print request headers, credentials or arbitrary server bodies.
            raise RuntimeError(f'Jira HTTP {exc.code}; dừng. Kiểm quyền/token hoặc thử lại sau nếu 429/5xx.') from None
        except (urllib.error.URLError, TimeoutError):
            raise RuntimeError('Mất kết nối/timeout; dừng. Có thể POST đã thành công; chạy lại để đọc trạng thái trước khi tạo tiếp.') from None

    def issue(self, key):
        issue = self.request(f'issue/{key}?fields=issuelinks,summary,labels')
        if issue['key'] != key:
            raise RuntimeError(f'{key}: Jira trả về ticket khác; cần kiểm mapping.')
        return issue


def relation(issue, other, type_id):
    links = issue['fields'].get('issuelinks', [])
    forward = any(str(link['type']['id']) == type_id and
                  link.get('outwardIssue', {}).get('key') == other for link in links)
    reverse = any(str(link['type']['id']) == type_id and
                  link.get('inwardIssue', {}).get('key') == other for link in links)
    return forward, reverse


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=['plan', 'check', 'pilot', 'apply'], default='plan')
    args = parser.parse_args()
    pairs = load_pairs()
    if args.mode == 'plan':
        print(f'Local: {len(pairs)} cặp; không kết nối Jira. Pilot: {pairs[0][0]} blocks {pairs[0][1]}.')
        return
    email = input('Email Atlassian: ').strip()
    token = getpass.getpass('API token (ẩn khi nhập): ').strip()
    if not email or not token:
        raise ValueError('Thiếu email/token.')
    jira = Jira(email, token)
    types = jira.request('issueLinkType')['issueLinkTypes']
    matches = [t for t in types if t['name'].lower() == 'blocks' and
               t['outward'].lower() == 'blocks' and t['inward'].lower() == 'is blocked by']
    if len(matches) != 1:
        raise RuntimeError('Không nhận diện duy nhất Blocks / blocks / is blocked by; cần kiểm cấu hình trước.')
    type_id = str(matches[0]['id'])
    selected = pairs[:1] if args.mode == 'pilot' else pairs
    cache = {}
    with DATA.with_name('jira-key-mapping.csv').open(encoding='utf-8-sig', newline='') as stream:
        expected = {r['Jira key']: r['Source ID'] for r in csv.DictReader(stream)}
    # Read every selected ticket and validate source identity before any mutation.
    for key in sorted({key for pair in selected for key in pair}):
        issue = jira.issue(key)
        source = expected[key]
        labels = issue['fields'].get('labels', [])
        label = 'source-' + source.lower().replace('.', '-')
        if not issue['fields']['summary'].startswith(f'[{source}]') or label not in labels:
            raise RuntimeError(f'{key}: mã WBS/label không khớp; không tạo liên kết.')
        cache[key] = issue
    missing = []
    for a, b in selected:
        forward, reverse = relation(cache[a], b, type_id)
        if reverse:
            raise RuntimeError(f'{a} / {b}: đã có liên kết ngược; dừng để review, không tự xóa.')
        if not forward:
            missing.append((a, b))
    print(f'Đã có đúng chiều: {len(selected)-len(missing)}; còn thiếu: {len(missing)} / {len(selected)}.')
    if args.mode == 'check':
        return
    if args.mode == 'apply':
        pilot_a, pilot_b = pairs[0]
        if not relation(cache[pilot_a], pilot_b, type_id)[0]:
            raise RuntimeError('Chưa có pilot đúng chiều. Chạy --mode pilot, kiểm UI rồi mới apply.')
    if not missing:
        print('Không cần tạo thêm liên kết.')
        return
    confirm = input(f'Tạo {len(missing)} liên kết (chỉ issue links)? Gõ YES: ')
    if confirm != 'YES':
        print('Đã hủy; không tạo liên kết.')
        return
    for index, (a, b) in enumerate(missing, 1):
        # Re-read before POST so reruns skip pairs already created.
        current = jira.issue(a)
        forward, reverse = relation(current, b, type_id)
        if reverse:
            raise RuntimeError(f'{a} / {b}: xuất hiện liên kết ngược; dừng.')
        if forward:
            print(f'Bỏ qua {a} blocks {b}: đã có.')
            continue
        jira.request('issueLink', {'type': {'id': type_id},
                                 'inwardIssue': {'key': a}, 'outwardIssue': {'key': b}})
        forward, reverse = relation(jira.issue(a), b, type_id)
        consumer = jira.issue(b)
        reciprocal = any(str(link['type']['id']) == type_id and
                         link.get('inwardIssue', {}).get('key') == a
                         for link in consumer['fields'].get('issuelinks', []))
        if not forward or reverse or not reciprocal:
            raise RuntimeError(f'{a} / {b}: chưa xác minh được đúng chiều ở hai phía; dừng, kiểm UI trước khi chạy lại.')
        print(f'{index}/{len(missing)}: {a} blocks {b} — đã kiểm hai phía.')
    print('Xong lượt tạo. Chạy --mode check để đối chiếu toàn bộ 171 cặp.')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, ValueError, KeyError, json.JSONDecodeError) as error:
        print(f'DỪNG: {error}', file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print('\nĐã dừng; chạy check trước khi tiếp tục.', file=sys.stderr)
        sys.exit(130)
