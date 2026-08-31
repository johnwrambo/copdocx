"""Confirm I-200/I-205 maps match the blanks and a fill does not flatten."""
from pathlib import Path
import re
import sys
import tempfile

from pypdf import PdfReader, PdfWriter

ROOT = Path(__file__).resolve().parents[1]


def field_names(pdf_path):
    reader = PdfReader(str(pdf_path))
    fields = reader.get_fields() or {}
    return set(fields), len(reader.pages)


def quoted_values(js_text, const_name):
    block = re.search(
        rf"var {re.escape(const_name)} = \{{(.*?)\n  \}};",
        js_text,
        re.S,
    )
    if not block:
        raise SystemExit(f"Could not find {const_name}")
    return set(re.findall(r'"([^"]+)"', block.group(1)))


def fill_unflattened(src, dest, values, checks_on, checks_off):
    reader = PdfReader(str(src))
    writer = PdfWriter()
    writer.append(reader)
    payload = dict(values)
    for name in checks_on:
        payload[name] = "/On"
    for name in checks_off:
        payload[name] = "/Off"
    for page in writer.pages:
        writer.update_page_form_field_values(page, payload, auto_regenerate=False)
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("wb") as handle:
        writer.write(handle)


def main():
    fail = 0
    i200_js = (ROOT / "functions/pdf/i200-map.js").read_text(encoding="utf-8")
    i205_js = (ROOT / "functions/pdf/i205-map.js").read_text(encoding="utf-8")
    i200_names, i200_pages = field_names(ROOT / "assets/pdf/I200_BLANK.pdf")
    i205_names, i205_pages = field_names(ROOT / "assets/pdf/I205_BLANK.pdf")

    mapped_200 = quoted_values(i200_js, "I200_FIELDS")
    mapped_205 = quoted_values(i205_js, "I205_FIELDS")
    sigs_200 = set(re.findall(r'"([^"]+)"', re.search(r"var I200_SIGNATURES = \[(.*?)\]", i200_js, re.S).group(1)))
    sigs_205 = set(re.findall(r'"([^"]+)"', re.search(r"var I205_SIGNATURES = \[(.*?)\]", i205_js, re.S).group(1)))

    print("I200 blank", len(i200_names), "fields", i200_pages, "pages")
    print("I205 blank", len(i205_names), "fields", i205_pages, "pages")

    for name in mapped_200:
        if name not in i200_names:
            print("FAIL I-200 map missing from PDF", name)
            fail += 1
    for name in mapped_205:
        if name not in i205_names:
            print("FAIL I-205 map missing from PDF", name)
            fail += 1
    for name in sigs_200:
        if name not in i200_names:
            print("FAIL I-200 signature missing", name)
            fail += 1
    for name in sigs_205:
        if name not in i205_names:
            print("FAIL I-205 signature missing", name)
            fail += 1

    out_dir = Path(tempfile.gettempdir()) / "copdocx-warrant-fill"
    fill_unflattened(
        ROOT / "assets/pdf/I200_BLANK.pdf",
        out_dir / "I-200_GARCIA_LUIS_A000111222_20260830.pdf",
        {
            "File No": "A000 111 222",
            "Date": "08/30/2026",
            "Name of Alien": "GARCIA, LUIS",
            "Printed Name and Title of Authorized Immigration Officer": "REYES, Maria, IO",
            "Location": "ERO Dallas",
        },
        ["the execution of a charging document to initiate removal proceedings against the subject"],
        [
            "the pendency of ongoing removal proceedings against the subject",
            "the failure to establish admissibility subsequent to deferred inspection",
            "biometric confirmation of the subjects identity and a records check of federal",
            "statements made voluntarily by the subject to an immigration officer andor other",
        ],
    )
    fill_unflattened(
        ROOT / "assets/pdf/I205_BLANK.pdf",
        out_dir / "I-205_GARCIA_LUIS_A000111222_20260830.pdf",
        {
            "File No": "A000 111 222",
            "Date": "08/30/2026",
            "Full name of alien": "GARCIA, LUIS",
            "Title of immigration officer": "IO",
            "Date and office location": "08/30/2026, ERO Dallas",
            "INA LAW": "237(a)(1)(A)",
        },
        ["an immigration judge in exclusion deportation or removal proceedings"],
        [
            "a designated official",
            "the Board of Immigration Appeals",
            "a United States District or Magistrate Court Judge",
        ],
    )

    filled_200, _ = field_names(out_dir / "I-200_GARCIA_LUIS_A000111222_20260830.pdf")
    filled_205, _ = field_names(out_dir / "I-205_GARCIA_LUIS_A000111222_20260830.pdf")
    if filled_200 != i200_names:
        print("FAIL I-200 flatten or field loss", sorted(i200_names - filled_200), sorted(filled_200 - i200_names))
        fail += 1
    else:
        print("ok I-200 still has", len(filled_200), "fields")
    if filled_205 != i205_names:
        print("FAIL I-205 flatten or field loss", sorted(i205_names - filled_205), sorted(filled_205 - i205_names))
        fail += 1
    else:
        print("ok I-205 still has", len(filled_205), "fields")

    for name in sigs_200:
        if name not in filled_200:
            print("FAIL I-200 signature widget gone", name)
            fail += 1
    for name in sigs_205:
        if name not in filled_205:
            print("FAIL I-205 signature widget gone", name)
            fail += 1

    if fail:
        sys.exit(1)
    print("ok warrant pdf fields")


if __name__ == "__main__":
    main()
