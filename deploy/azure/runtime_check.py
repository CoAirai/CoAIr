"""Explicit synthetic OCR/Blob qualification inside the target API image.

--ocr uses only a generated document and local Tesseract (no model call).
--blob writes, reads and deletes one random migration-probes/ object. No user
document, registry, vector or accounting state is changed by this checker.
"""
import argparse
import json
from pathlib import Path
import tempfile
import uuid


def ocr_check(directory, pdf=None):
    import fitz
    import pytesseract
    from src import ocr
    from src.config import OCR_LANG, OCR_MODE, OCR_ENGINE, OCR_MAX_PAGES_PER_DOC
    if OCR_MODE == "off" or OCR_ENGINE != "tesseract" or OCR_MAX_PAGES_PER_DOC < 1:
        raise ValueError("ocr_configuration_not_qualified")
    languages = set(pytesseract.get_languages(config=""))
    if not set(OCR_LANG.split("+")).issubset(languages):
        raise ValueError("ocr_language_missing")
    # Rasterize real font text. A PDF text layer would falsely pass without OCR.
    if pdf is None:
        pdf = directory / "scan.pdf"
        with fitz.open() as native:
            page = native.new_page(width=800, height=250)
            page.insert_text((30, 120), "COAIR MIGRATION CHECK 12345", fontsize=36)
            png = page.get_pixmap(matrix=fitz.Matrix(2, 2)).tobytes("png")
        with fitz.open() as document:
            page = document.new_page(width=800, height=250)
            page.insert_image(page.rect, stream=png)
            document.save(pdf)
    # Keep the synthetic test out of the application's persistent OCR cache.
    old_fallback = ocr.OCR_VISION_FALLBACK_ENABLED
    try:
        ocr.OCR_VISION_FALLBACK_ENABLED = False
        pipeline = ocr.OCRPipeline()
        pipeline.cache = ocr.OCRCache(str(directory / f"ocr-cache-{uuid.uuid4().hex}"))
        rows = pipeline.extract_text_auto(str(pdf))
    finally:
        ocr.OCR_VISION_FALLBACK_ENABLED = old_fallback
    text = " ".join(row.text for row in rows)
    if len(rows) != 1 or rows[0].extraction_method != "ocr" or "MIGRATION" not in text or "12345" not in text:
        raise ValueError("ocr_synthetic_scan_failed")
    return {"ok": True, "engine": "tesseract", "language": OCR_LANG,
            "configured_max_pages": OCR_MAX_PAGES_PER_DOC, "page_count": len(rows)}, pdf


def blob_check(directory, source):
    from src import azure_blob_storage as store
    key = f"migration-probes/{uuid.uuid4().hex}/{source.name}"
    destination = directory / "cold-download" / source.name
    created = False
    try:
        store.upload_file(str(source), key)
        created = True
        if not store.download_file(key, str(destination)) or store.file_sha256(source) != store.file_sha256(destination):
            raise ValueError("blob_roundtrip_mismatch")
        report = {"ok": True, "cold_download": True, "sha256_matches": True}
        if source.suffix == ".pdf":
            report["ocr_on_downloaded_scan"], _ = ocr_check(directory, pdf=destination)
        return report
    finally:
        if created:
            store.delete_blob(key)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ocr", action="store_true")
    parser.add_argument("--blob", action="store_true")
    args = parser.parse_args()
    if not (args.ocr or args.blob):
        parser.error("Choose --ocr and/or --blob explicitly")
    results = {}
    try:
        with tempfile.TemporaryDirectory(prefix="coair-runtime-") as temporary:
            directory = Path(temporary)
            source = directory / "probe.txt"
            source.write_text("COAIR MIGRATION CHECK 12345\n")
            if args.ocr:
                results["ocr"], source = ocr_check(directory)
            if args.blob:
                results["blob"] = blob_check(directory, source)
        print(json.dumps({"checks": results, "ok": True, "production_accepted": False}))
        return 0
    except Exception as exc:
        print(json.dumps({"checks": results, "ok": False, "error": type(exc).__name__,
                          "production_accepted": False}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
