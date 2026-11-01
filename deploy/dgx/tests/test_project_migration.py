import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('project_migration',Path(__file__).parents[1]/'migrate_project.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class ScopeTests(unittest.TestCase):
    def test_registry_selection_never_unions_other_projects(self):
        a={'doc_id':'a','project_id':'selected'};b={'doc_id':'b','project_id':'other'}
        self.assertEqual(m.scoped_records({'a':a,'b':b},'selected'),{'a':a})
        with self.assertRaises(ValueError):m.scoped_records({'a':a},'other')

    def test_resume_preserves_identity_but_accepts_changed_derivative_status(self):
        row={'doc_id':'a','project_id':'selected','file_name':'a.pdf','file_path':'/app/data/a.pdf','file_hash':'same','status':'completed'}
        updated={**row,'event_index_status':'failed'}
        self.assertEqual(m.merge_registry({'a':row},{'a':updated})['a'],updated)
        with self.assertRaises(ValueError):m.merge_registry({'a':row},{'a':{**updated,'file_hash':'different'}})
        with self.assertRaises(ValueError):m.merge_registry({'a':row},{'a':{**updated,'project_id':'other'}})

    def test_paths_reject_traversal_and_external_sources(self):
        for value in ('relative.pdf','/etc/passwd','/app/storage/../../etc/passwd'):
            with self.subTest(path=value),self.assertRaises(ValueError):m.mapped_path(value)
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'data').mkdir();(root/'data/link').symlink_to('/etc')
            with self.assertRaises(ValueError):m.mapped_path('/app/data/link/passwd',source=root)

    def test_copy_is_hash_verified_and_cannot_replace_existing_data(self):
        with tempfile.TemporaryDirectory() as folder,patch.object(m.os,'chown'):
            root=Path(folder);a=root/'source';b=root/'target';a.write_bytes(b'original')
            m.copy_file(a,b);m.copy_file(a,b)
            b.write_bytes(b'existing unrelated data')
            with self.assertRaises(ValueError):m.copy_file(a,b)
            self.assertEqual(b.read_bytes(),b'existing unrelated data')

class DuckDBTests(unittest.TestCase):
    def test_search_copy_is_scoped_atomic_and_resumable(self):
        try:import duckdb
        except ImportError:self.skipTest('Run in the qualified API image for DuckDB')
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);old=root/'old.db';new=root/'new.db'
            for path in (old,new):
                db=duckdb.connect(str(path))
                for table in ('chunks','document_index'):
                    db.execute('CREATE TABLE '+table+'(id VARCHAR PRIMARY KEY,project_id VARCHAR,text VARCHAR)')
                db.execute('CREATE TABLE chunk_store_meta(key VARCHAR PRIMARY KEY,value VARCHAR)');db.close()
            db=duckdb.connect(str(old))
            for table in ('chunks','document_index'):
                db.execute('INSERT INTO '+table+' VALUES (?,?,?),(?,?,?)',['a','selected','allowed','b','other','private'])
            db.close()
            for _ in range(2):self.assertEqual(m.merge_chunk_database(old,new,'selected'),{'chunks':1,'document_index':1})
            db=duckdb.connect(str(new));self.assertEqual(db.execute('SELECT text FROM chunks').fetchall(),[('allowed',)])
            db.execute("UPDATE chunks SET text='changed' WHERE id='a'");db.close()
            with self.assertRaises(ValueError):m.merge_chunk_database(old,new,'selected')


class LegacyTimelineTests(unittest.TestCase):
    def test_legacy_events_follow_only_approved_documents(self):
        try:import duckdb
        except ImportError:self.skipTest('Run in the qualified API image for DuckDB')
        with tempfile.TemporaryDirectory() as folder,patch.object(m.os,'chown'):
            root=Path(folder);source=root/'source';target=root/'target'
            old=source/'storage/events/events.db';old.parent.mkdir(parents=True)
            db=duckdb.connect(str(old))
            db.execute('CREATE TABLE events(event_id VARCHAR PRIMARY KEY,doc_id VARCHAR,project VARCHAR)')
            db.execute("INSERT INTO events VALUES ('one','allowed','legacy label'),('two','private','other')")
            db.close()
            with patch.object(m,'SOURCE',source),patch.object(m,'TARGET',target):
                self.assertEqual(m.copy_legacy_timeline({'allowed':{}}),1)
                self.assertEqual(m.copy_legacy_timeline({'allowed':{}}),1)
            db=duckdb.connect(str(target/'storage/events/events.db'))
            self.assertEqual(db.execute('SELECT doc_id,project FROM events').fetchall(),[('allowed',m.PROJECT)])
            db.close()

if __name__=='__main__':unittest.main()
