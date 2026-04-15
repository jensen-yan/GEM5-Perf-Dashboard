import unittest

from scripts.dashboard_data import DATASET_BY_ID
from scripts.update_data import find_dataset_artifact, select_run_for_dataset


class SelectRunForDatasetTest(unittest.TestCase):
    def test_picks_matching_workflow_for_commit(self) -> None:
        dataset = DATASET_BY_ID['idealkmhv3-gcc12-spec06-0.8c']
        runs = [
            {
                'id': 1201,
                'name': 'gem5 Performance Test (Tier 2 - Post-Merge)',
                'path': '.github/workflows/gem5-perf.yml',
                'event': 'push',
                'head_branch': 'xs-dev',
                'conclusion': 'success',
            },
            {
                'id': 1400,
                'name': 'gem5 Ideal BTB Performance Test',
                'path': '.github/workflows/gem5-ideal-btb-perf.yml',
                'event': 'push',
                'head_branch': 'xs-dev',
                'conclusion': 'success',
            },
        ]

        selected = select_run_for_dataset(runs, dataset)

        self.assertIsNotNone(selected)
        self.assertEqual(selected['id'], 1400)

    def test_ignores_unsuccessful_or_wrong_branch_runs(self) -> None:
        dataset = DATASET_BY_ID['kmhv3-gcc15-spec06-0.3c']
        runs = [
            {
                'id': 10,
                'name': 'gem5 Align BTB Performance Test(0.3c)',
                'path': '.github/workflows/gem5-ideal-btb-0.3c.yml',
                'event': 'push',
                'head_branch': 'topic',
                'conclusion': 'success',
            },
            {
                'id': 11,
                'name': 'gem5 Align BTB Performance Test(0.3c)',
                'path': '.github/workflows/gem5-ideal-btb-0.3c.yml',
                'event': 'push',
                'head_branch': 'xs-dev',
                'conclusion': 'failure',
            },
        ]

        self.assertIsNone(select_run_for_dataset(runs, dataset))


class FindDatasetArtifactTest(unittest.TestCase):
    def test_selects_exact_unexpired_artifact(self) -> None:
        dataset = DATASET_BY_ID['idealkmhv3-gcc15-spec06-0.8c']
        artifacts = [
            {'id': 1, 'name': 'performance-score-gcc15-spec06-0.8c-debug', 'expired': False},
            {'id': 2, 'name': 'performance-score-gcc15-spec06-0.8c', 'expired': True},
            {'id': 3, 'name': 'performance-score-gcc15-spec06-0.8c', 'expired': False},
        ]

        artifact = find_dataset_artifact(artifacts, dataset)

        self.assertIsNotNone(artifact)
        self.assertEqual(artifact['id'], 3)


if __name__ == '__main__':
    unittest.main()
