import pytest
from src.openai_compatible import PublicTextFilter, validate_endpoint

@pytest.mark.parametrize('host', ['api.openai.com', 'example.com', '8.8.8.8', '[2001:4860:4860::8888]'])
def test_local_transport_rejects_public_endpoints(host):
    with pytest.raises(ValueError, match='private endpoint'):
        validate_endpoint(f'https://{host}/v1', 'configured-key')

@pytest.mark.parametrize('host', ['127.0.0.1', '100.91.121.116', 'secure-model-proxy', '[::1]'])
def test_local_transport_accepts_private_endpoints(host):
    validate_endpoint(f'http://{host}/v1', 'configured-key')

@pytest.mark.parametrize('step', [1, 2, 4, 7, 20])
def test_stream_filter_handles_tags_split_at_arbitrary_boundaries(step):
    text = 'Public <think>private reasoning</think>answer with spaces.'
    f = PublicTextFilter()
    output = ''.join(f.feed(text[i:i+step]) for i in range(0, len(text), step)) + f.feed('', final=True)
    assert output == 'Public answer with spaces.'
    assert not f.inside

def test_stream_filter_discards_unfinished_reasoning():
    f = PublicTextFilter()
    assert f.feed('<think>private') + f.feed('', final=True) == ''
    assert f.inside
