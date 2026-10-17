"""Real Word footnotes for python-docx documents.

python-docx can read footnote references but does not expose a public authoring
API. References are inserted into the document tree while footnotes.xml and its
package relationships are added deterministically after save.
"""

from __future__ import annotations

import io
import re
import zipfile
from dataclasses import dataclass, field
from typing import List
from xml.etree import ElementTree as ET

from docx.oxml import OxmlElement
from docx.oxml.ns import qn


W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
FOOTNOTE_REL = f"{R_NS}/footnotes"
FOOTNOTE_CONTENT_TYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"
)
_XML_ILLEGAL = re.compile(r"[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD]")


def xml_text(value: str) -> str:
    """Drop characters XML 1.0 cannot store. Word treats them as unreadable content."""
    return _XML_ILLEGAL.sub("", value or "")


@dataclass
class FootnoteRegistry:
    texts: List[str] = field(default_factory=list)

    def add(self, paragraph, text: str) -> int:
        footnote_id = len(self.texts) + 1
        self.texts.append(xml_text(text).strip())
        run = OxmlElement("w:r")
        rpr = OxmlElement("w:rPr")
        style = OxmlElement("w:rStyle")
        style.set(qn("w:val"), "FootnoteReference")
        rpr.append(style)
        run.append(rpr)
        ref = OxmlElement("w:footnoteReference")
        ref.set(qn("w:id"), str(footnote_id))
        run.append(ref)
        paragraph._p.append(run)
        return footnote_id


def _footnotes_xml(texts: List[str]) -> bytes:
    ET.register_namespace("w", W_NS)
    root = ET.Element(f"{{{W_NS}}}footnotes")

    for special_id, tag in ((-1, "separator"), (0, "continuationSeparator")):
        fn = ET.SubElement(root, f"{{{W_NS}}}footnote", {
            f"{{{W_NS}}}type": tag, f"{{{W_NS}}}id": str(special_id),
        })
        p = ET.SubElement(fn, f"{{{W_NS}}}p")
        r = ET.SubElement(p, f"{{{W_NS}}}r")
        ET.SubElement(r, f"{{{W_NS}}}{tag}")

    for index, value in enumerate(texts, 1):
        fn = ET.SubElement(root, f"{{{W_NS}}}footnote", {f"{{{W_NS}}}id": str(index)})
        p = ET.SubElement(fn, f"{{{W_NS}}}p")
        ppr = ET.SubElement(p, f"{{{W_NS}}}pPr")
        ET.SubElement(ppr, f"{{{W_NS}}}pStyle", {f"{{{W_NS}}}val": "FootnoteText"})
        rr = ET.SubElement(p, f"{{{W_NS}}}r")
        rrpr = ET.SubElement(rr, f"{{{W_NS}}}rPr")
        ET.SubElement(rrpr, f"{{{W_NS}}}rStyle", {f"{{{W_NS}}}val": "FootnoteReference"})
        ET.SubElement(rr, f"{{{W_NS}}}footnoteRef")
        text_run = ET.SubElement(p, f"{{{W_NS}}}r")
        node = ET.SubElement(text_run, f"{{{W_NS}}}t", {
            "{http://www.w3.org/XML/1998/namespace}space": "preserve"
        })
        node.text = " " + xml_text(value)
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def _insert_before(raw: bytes, end_tag: bytes, snippet: str) -> bytes:
    """Insert markup without re-serializing the part.

    ElementTree renames Word's markup-compatibility prefix and drops the w14
    declaration. Word then reports unreadable content and offers to repair.
    """
    addition = snippet.encode("utf-8")
    index = raw.rfind(end_tag)
    if index < 0:
        return raw
    return raw[:index] + addition + raw[index:]


def _patch_relationships(raw: bytes) -> bytes:
    if b"/relationships/footnotes" in raw:
        return raw
    used = [int(item) for item in re.findall(br'Id="rId(\d+)"', raw)]
    snippet = (
        f'<Relationship Id="rId{max(used, default=0) + 1}" '
        f'Type="{FOOTNOTE_REL}" Target="footnotes.xml"/>'
    )
    return _insert_before(raw, b"</Relationships>", snippet)


def _patch_content_types(raw: bytes) -> bytes:
    if b"/word/footnotes.xml" in raw:
        return raw
    snippet = (
        '<Override PartName="/word/footnotes.xml" '
        f'ContentType="{FOOTNOTE_CONTENT_TYPE}"/>'
    )
    return _insert_before(raw, b"</Types>", snippet)


def _patch_styles(raw: bytes) -> bytes:
    """Add the built-in footnote styles omitted by python-docx's template."""
    parts = []
    if b'w:styleId="FootnoteText"' not in raw:
        parts.append(
            '<w:style w:type="paragraph" w:styleId="FootnoteText">'
            '<w:name w:val="footnote text"/>'
            '<w:basedOn w:val="Normal"/>'
            '<w:uiPriority w:val="99"/>'
            '<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>'
            '<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
            '</w:style>'
        )
    if b'w:styleId="FootnoteReference"' not in raw:
        parts.append(
            '<w:style w:type="character" w:styleId="FootnoteReference">'
            '<w:name w:val="footnote reference"/>'
            '<w:semiHidden/><w:unhideWhenUsed/>'
            '<w:rPr><w:vertAlign w:val="superscript"/></w:rPr>'
            '</w:style>'
        )
    if not parts:
        return raw
    return _insert_before(raw, b"</w:styles>", "".join(parts))


def attach_footnote_part(docx_bytes: bytes, texts: List[str]) -> bytes:
    if not texts:
        return docx_bytes
    source = io.BytesIO(docx_bytes)
    output = io.BytesIO()
    with zipfile.ZipFile(source, "r") as zin, zipfile.ZipFile(
        output, "w", compression=zipfile.ZIP_DEFLATED
    ) as zout:
        for item in zin.infolist():
            if item.filename == "word/footnotes.xml":
                continue
            data = zin.read(item.filename)
            if item.filename == "word/_rels/document.xml.rels":
                data = _patch_relationships(data)
            elif item.filename == "[Content_Types].xml":
                data = _patch_content_types(data)
            elif item.filename == "word/styles.xml":
                data = _patch_styles(data)
            zout.writestr(item, data)
        zout.writestr("word/footnotes.xml", _footnotes_xml(texts))
    return output.getvalue()


__all__ = ["FootnoteRegistry", "attach_footnote_part"]
