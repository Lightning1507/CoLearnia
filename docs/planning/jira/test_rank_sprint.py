"""Offline safety and ranking checks. No credentials or network required."""
import copy
import importlib.util
import io
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('rank_sprint', Path(__file__).with_name('rank-sprint.py'))
rank = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rank)


def fixtures(plan):
    return [{'key': row['Jira key'], 'id': str(10000 + index), 'fields': {
        'summary': f"[{row['Source ID']}] Example",
        'labels': ['source-' + row['Source ID'].lower().replace('.', '-')],
        'parent': {'key': 'SCRUM-5'}, 'assignee': {'accountId': 'fixture'},
        'timeoriginalestimate': int(row['Hours']) * 3600,
    }} for index, row in enumerate(plan)]


class FakeJira:
    def __init__(self, issues):
        self.data = copy.deepcopy(issues)
        self.writes = []

    def issues(self):
        return copy.deepcopy(self.data)

    def move(self, key, anchor, before=False):
        item = next(i for i in self.data if i['key'] == key)
        self.data.remove(item)
        index = next(n for n, i in enumerate(self.data) if i['key'] == anchor)
        self.data.insert(index if before else index + 1, item)
        self.writes.append((key, anchor, before))


class RankingTests(unittest.TestCase):
    def setUp(self):
        self.plan = rank.load_plan()
        self.desired = [r['Jira key'] for r in self.plan]
        self.issues = fixtures(self.plan)

    def test_complete_plan_and_first_five(self):
        self.assertEqual(self.desired[:5], ['SCRUM-12', 'SCRUM-14', 'SCRUM-22', 'SCRUM-44', 'SCRUM-69'])
        self.assertEqual(sum(int(r['Hours']) for r in self.plan), 379)

    def test_bad_dependency_order_rejected(self):
        original = rank.rows
        def changed(name):
            data = original(name)
            if name == 'sprint-1-rank.csv':
                data[0], data[-1] = data[-1], data[0]
                for i, row in enumerate(data, 1):
                    row['Position'] = str(i)
            return data
        with patch.object(rank, 'rows', changed), self.assertRaises(ValueError):
            rank.load_plan()

    def test_missing_or_duplicate_remote_rejected(self):
        for data in [self.issues[:-1], self.issues[:-1] + [self.issues[0]]]:
            with self.assertRaises(RuntimeError):
                rank.validate_remote(data, self.plan)

    def test_wrong_identity_rejected(self):
        self.issues[0]['fields']['labels'] = []
        with self.assertRaises(RuntimeError):
            rank.validate_remote(self.issues, self.plan)

    def test_field_changes_detected(self):
        for field, value in [('parent', None), ('assignee', None), ('timeoriginalestimate', 1)]:
            other = copy.deepcopy(self.issues)
            other[0]['fields'][field] = value
            with self.assertRaises(RuntimeError):
                rank.unchanged(self.issues, other)

    def test_pilot_only_moves_five_and_preserves_other_order(self):
        initial = list(reversed(self.issues))
        jira = FakeJira(initial)
        with redirect_stdout(io.StringIO()):
            rank.reorder(jira, self.plan, self.desired[:5], initial)
        actual = [i['key'] for i in jira.data]
        self.assertEqual(actual[:5], self.desired[:5])
        self.assertEqual(actual[5:], [i['key'] for i in initial if i['key'] not in self.desired[:5]])
        self.assertTrue(all(key in self.desired[:5] for key, _, _ in jira.writes))

    def test_full_rank_and_rerun_no_writes(self):
        initial = list(reversed(self.issues))
        jira = FakeJira(initial)
        with redirect_stdout(io.StringIO()):
            rank.reorder(jira, self.plan, self.desired, initial)
            self.assertEqual([i['key'] for i in jira.data], self.desired)
            jira.writes.clear()
            rank.reorder(jira, self.plan, self.desired, jira.issues())
        self.assertEqual(jira.writes, [])

    def test_wrong_write_endpoint_denied(self):
        jira = rank.Jira('fixture', 'fixture')
        with self.assertRaises(ValueError):
            jira.request('/rest/api/3/issue/SCRUM-12', {'fields': {}})

    def test_partial_success_response_stops(self):
        class Response:
            status = 207
            def __enter__(self): return self
            def __exit__(self, *args): return False
        jira = rank.Jira('fixture', 'fixture')
        with patch.object(jira.opener, 'open', return_value=Response()), self.assertRaises(RuntimeError):
            jira.request('/rest/agile/1.0/issue/rank', {'issues': ['SCRUM-12']})

    def test_pagination(self):
        jira = rank.Jira('fixture', 'fixture')
        jira.rank_field, jira.sprint_id = 10000, 7
        pages = [{'issues': self.issues[:50], 'nextPageToken': 'page2'},
                 {'issues': self.issues[50:], 'isLast': True}]
        with patch.object(jira, 'request', side_effect=pages) as request:
            self.assertEqual(len(jira.issues()), 80)
            self.assertIn('nextPageToken=page2', request.call_args.args[0])

    def test_reconcile_recent_writes_and_no_mutation_retry(self):
        jira = rank.Jira('fixture', 'fixture')
        jira.issue_ids = {'SCRUM-14': 10014, 'SCRUM-12': 10012}
        jira.rank_field, jira.sprint_id = 10000, 7
        with patch.object(jira, 'request', return_value=None) as request:
            jira.move('SCRUM-14', 'SCRUM-12')
            self.assertEqual(request.call_count, 1)
        self.assertEqual(jira.reconcile_ids, [10014, 10012])
        with patch.object(jira, 'request', return_value={'issues': [], 'isLast': True}) as request:
            jira.issues()
            path = request.call_args.args[0]
            self.assertIn('reconcileIssues=10014', path)
            self.assertIn('reconcileIssues=10012', path)

    def test_reconcile_never_exceeds_fifty(self):
        jira = rank.Jira('fixture', 'fixture')
        jira.rank_field = 10000
        jira.issue_ids = {str(i): i for i in range(80)}
        with patch.object(jira, 'request', return_value=None):
            for i in range(1, 80):
                jira.move(str(i), str(i - 1))
        self.assertEqual(len(jira.reconcile_ids), 50)
        self.assertEqual(len(set(jira.reconcile_ids)), 50)

    def test_stale_search_then_converges_without_second_write(self):
        initial = list(reversed(self.issues))
        class DelayedJira(FakeJira):
            def move(self, key, anchor, before=False):
                self.stale = self.issues()
                super().move(key, anchor, before)
                self.pending = 2
            def issues(self):
                if getattr(self, 'pending', 0):
                    self.pending -= 1
                    return copy.deepcopy(self.stale)
                return super().issues()
        jira = DelayedJira(initial)
        with patch.object(rank.time, 'sleep'), redirect_stdout(io.StringIO()):
            rank.reorder(jira, self.plan, self.desired[:1], initial)
        self.assertEqual(len(jira.writes), 1)
        self.assertEqual(jira.data[0]['key'], self.desired[0])

    def test_persistent_mismatch_stops_without_second_write(self):
        initial = list(reversed(self.issues))
        class IgnoredMove(FakeJira):
            def move(self, key, anchor, before=False):
                self.writes.append((key, anchor, before))
        jira = IgnoredMove(initial)
        with patch.object(rank.time, 'sleep') as sleep, redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(RuntimeError, '6 lần'):
                rank.reorder(jira, self.plan, self.desired[:1], initial)
        self.assertEqual(len(jira.writes), 1)
        self.assertEqual(sleep.call_count, 5)

    def test_wait_stops_on_field_drift_without_retry(self):
        changed = copy.deepcopy(self.issues)
        changed[0]['fields']['parent'] = None
        jira = FakeJira(changed)
        with patch.object(rank.time, 'sleep') as sleep, self.assertRaises(RuntimeError):
            rank.wait_for_rank(jira, self.plan, self.desired, self.issues)
        sleep.assert_not_called()


if __name__ == '__main__':
    unittest.main()
