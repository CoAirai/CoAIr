"""The normal download must preserve the generated narrative and footnotes."""
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from backend.api import reports


class ReportDeliveryParityTests(unittest.TestCase):
    def test_default_download_serves_stored_narrative_and_table_is_explicit(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / 'report.docx'
            path.write_bytes(b'generated narrative with footnotes')
            job = dict(status='ready', module='chronology', title='Utilities',
                       result={'entries': []}, docx_path=str(path))
            store = SimpleNamespace(get=lambda job_id, project_id: job if project_id == 'a' else None)
            with patch.object(reports, 'get_report_job_store', return_value=store), \
                 patch('src.chronology_template_docx.build_event_chronology_docx', return_value=b'table') as table:
                project = SimpleNamespace(project_id='a', name='Edinburgh')
                self.assertEqual(reports.download_report('j', project).body, path.read_bytes())
                table.assert_not_called()
                self.assertEqual(reports.download_report('j', project, format='table').body, b'table')
                with self.assertRaises(HTTPException) as error:
                    reports.download_report('j', SimpleNamespace(project_id='b'))
                self.assertEqual(error.exception.status_code, 404)

    def test_failed_jobs_are_hidden_without_losing_running_jobs_or_diagnostics(self):
        jobs = [dict(job_id='bad', status='failed', module='chronology'),
                dict(job_id='active', status='processing', module='chronology'),
                dict(job_id='done', status='ready', module='chronology')]
        store = MagicMock()
        store.list_project.return_value = jobs
        store.get.return_value = jobs[0]
        with patch.object(reports, 'get_report_job_store', return_value=store), \
             patch.object(reports, '_public', side_effect=lambda job: job), \
             patch.object(reports, 'user_has_right', return_value=True):
            project = SimpleNamespace(project_id='a')
            result = reports.list_reports('chronology', SimpleNamespace(), project)
            self.assertEqual([job['job_id'] for job in result['reports']], ['active', 'done'])
            self.assertEqual(reports.get_report('bad', project)['status'], 'failed')
            store.list_project.assert_called_once_with('a', module='chronology')

    def test_forensic_failures_keep_the_existing_retry_visibility(self):
        job = dict(job_id='forensic-bad', status='failed', module='forensic')
        store = SimpleNamespace(list_project=lambda *args, **kwargs: [job])
        with patch.object(reports, 'get_report_job_store', return_value=store), \
             patch.object(reports, '_public', side_effect=lambda value: value), \
             patch.object(reports, 'user_has_right', return_value=True):
            result = reports.list_reports('forensic', SimpleNamespace(), SimpleNamespace(project_id='a'))
            self.assertEqual(result['reports'], [job])


if __name__ == '__main__':
    unittest.main()
