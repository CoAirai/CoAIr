import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from src import light_graph as g

class AtomicGraphTests(unittest.TestCase):
    def test_failed_write_preserves_previous_graph(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'graph.json';path.write_text('{"nodes":{"old":{}}}')
            graph=g.LightGraph.__new__(g.LightGraph);graph.graph=g.DocumentGraph(nodes={'new':{}})
            graph._graph_file=path
            with patch.object(g,'GRAPH_FILE',path),patch.object(g.json,'dump',side_effect=OSError('disk error')):
                graph._save_graph()
            self.assertEqual(json.loads(path.read_text())['nodes'],{'old':{}})
            self.assertEqual(list(Path(folder).glob('*.tmp')),[])
            with patch.object(g,'GRAPH_FILE',path):graph._save_graph()
            self.assertEqual(json.loads(path.read_text())['nodes'],{'new':{}})
