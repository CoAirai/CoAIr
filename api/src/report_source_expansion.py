"""Resolve retrieval previews to owned source windows before report extraction.

The mirror is authoritative for project ownership. Canonical aliases require a
unique project registry record; filenames alone never widen a selected scope.
No provider calls or vector/OCR reprocessing are performed here.
"""
from __future__ import annotations

from collections import defaultdict

WINDOW_CHARS = 3500
WINDOW_OVERLAP = 200


def source_windows(source):
    text = str(source.get('text') or source.get('text_snippet') or source.get('highlight_text') or '').strip()
    for offset in range(0, len(text), WINDOW_CHARS - WINDOW_OVERLAP):
        part = text[offset:offset + WINDOW_CHARS]
        if part.strip():
            yield {**source, 'text': part, 'text_snippet': part, 'evidence_offset': offset}


def expand_report_sources(project_id, sources, *, con, registry, doc_ids=(), stats=None):
    stats = stats if stats is not None else {}
    stats.update({'seed_passages':len(sources), 'expanded_pages':0,
                  'unhydrated_previews':0, 'scope_rejections':0})
    allowed = set(doc_ids)
    groups = defaultdict(list)
    owned = registry.get_all(project_id=project_id) if registry else []
    by_name = defaultdict(list)
    for record in owned:
        by_name[record.file_name].append(record)
    for source in sources:
        raw_id = str(source.get('doc_id') or '')
        name = str(source.get('file_name') or source.get('doc_name') or '')
        record = registry.get(raw_id) if registry else None
        if (source.get('project_id') not in (None,'',project_id)
                or (record and record.project_id != project_id)):
            stats['scope_rejections'] += 1
            continue
        canonical = raw_id
        # Legacy fragment IDs can be related to a canonical selected file only
        # by a unique authoritative registry entry in this project.
        if allowed and raw_id not in allowed:
            matches = by_name.get(name, [])
            if record or len(matches) != 1 or matches[0].doc_id not in allowed:
                stats['scope_rejections'] += 1
                continue
            canonical = matches[0].doc_id
        groups[(raw_id, canonical, name)].append(source)

    for (raw_id, canonical, name), seeds in groups.items():
        # Merge overlapping page ranges. Repeated research questions and lanes
        # must not cause the same source page to be read again.
        ranges = []
        for page in sorted({max(1,int(s.get('page_number') or 1)) for s in seeds}):
            lo,hi=max(1,page-1),page+1
            if ranges and lo <= ranges[-1][1]+1:
                ranges[-1]=(ranges[-1][0],max(hi,ranges[-1][1]))
            else:
                ranges.append((lo,hi))
        score=max(float(s.get('score') or 0) for s in seeds)
        page_scores={page:max(float(s.get('score') or 0) for s in seeds
                             if int(s.get('page_number') or 1)==page)
                     for page in {int(s.get('page_number') or 1) for s in seeds}}
        found_pages=set()
        for lo,hi in ranges:
            rows=[]
            if con is not None and raw_id:
                try:
                    rows=con.execute(
                        'SELECT doc_id,file_name,page_number,text,chunk_id FROM chunks '
                        'WHERE project_id=? AND doc_id=? AND page_number BETWEEN ? AND ? '
                        'ORDER BY page_number,chunk_id', [project_id,raw_id,lo,hi],
                    ).fetchall()
                except Exception:
                    stats['mirror_read_failed']=True
            for row_id,row_name,page,text,chunk_id in rows:
                if canonical != raw_id and row_name != name:
                    continue
                found_pages.add(int(page or 1))
                # Neighbours retain their owning document and exact page. Never
                # OR a filename into the identity predicate.
                yield from source_windows({
                    **seeds[0], 'doc_id':canonical, 'file_name':row_name,
                    'page_number':page, 'text':text, 'chunk_id':chunk_id,
                    'score':page_scores.get(int(page or 1),score*0.85), 'project_id':project_id,
                })
        stats['expanded_pages'] += len(found_pages)
        for seed in seeds:
            if int(seed.get('page_number') or 1) in found_pages:
                continue
            if not seed.get('text'):
                stats['unhydrated_previews'] += 1
            yield from source_windows({**seed,'doc_id':canonical})
