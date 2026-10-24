"""Do not recursively process generated glossary definitions."""
import unittest
from src.jargon_manager import JargonManager


class JargonExpansionBoundsTests(unittest.TestCase):
    def setUp(self):
        self.manager = object.__new__(JargonManager)
        self.manager._abbr_to_meaning = {
            'AB': 'AB contract', 'PB': 'Firm engaged as SDS provider',
            'SDS': 'System Design Services', 'EOT': 'Extension of Time',
        }

    def test_repeated_terms_grow_linearly_even_when_definition_contains_term(self):
        query = ' '.join(['AB'] * 12)
        result = self.manager.expand_query(query)
        self.assertEqual(result, ' '.join(['AB (AB contract)'] * 12))

    def test_generated_terms_are_not_expanded_by_later_matches(self):
        self.assertEqual(self.manager.expand_query('PB and SDS'),
                         'PB (Firm engaged as SDS provider) and SDS (System Design Services)')
        self.assertEqual(self.manager.replace_query_terms_with_meanings('PB and SDS'),
                         'Firm engaged as SDS provider and System Design Services')

    def test_existing_definition_is_not_duplicated(self):
        self.assertEqual(self.manager.expand_query('EOT (Extension of Time)'),
                         'EOT (Extension of Time)')
        self.assertEqual(self.manager.replace_query_terms_with_meanings('EOT (Extension of Time)'),
                         'Extension of Time')

    def test_unknown_words_and_abbreviation_boundaries_are_preserved(self):
        self.assertEqual(self.manager.expand_query('PBSDSX and ordinary text'), 'PBSDSX and ordinary text')
        self.assertEqual(self.manager.replace_query_terms_with_meanings('PBSDSX and ordinary text'),
                         'PBSDSX and ordinary text')
        self.assertEqual(self.manager.replace_query_terms_with_meanings('eot (pending)'),
                         'Extension of Time (pending)')


if __name__ == '__main__':
    unittest.main()
