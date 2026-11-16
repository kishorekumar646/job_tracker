"""
Author: Kishore Kumar
Skill vocabulary, resume text extraction and skill detection.
"""

import io
import re
from typing import Iterable

# canonical name -> extra aliases found in resumes
_SKILLS: dict[str, tuple[str, ...]] = {
    "Python": (), "Java": (), "JavaScript": ("js", "ecmascript"), "TypeScript": ("ts",),
    "C++": ("cpp",), "C#": ("csharp",), "C": (), "Go": ("golang",), "Rust": (), "Kotlin": (),
    "Swift": (), "PHP": (), "Ruby": (), "Scala": (), "R": (), "SQL": (), "Bash": ("shell scripting",),
    "React": ("react.js", "reactjs"), "Angular": ("angularjs",), "Vue": ("vue.js", "vuejs"),
    "Next.js": ("nextjs",), "Node.js": ("nodejs", "node"), "Express": ("express.js",),
    "Django": (), "Flask": (), "FastAPI": (), "Spring Boot": ("springboot", "spring"),
    "HTML": ("html5",), "CSS": ("css3",), "Tailwind CSS": ("tailwind",), "Redux": (),
    "GraphQL": (), "REST API": ("rest", "restful", "rest apis"),
    "PostgreSQL": ("postgres",), "MySQL": (), "MongoDB": ("mongo",), "Redis": (),
    "SQLite": (), "Elasticsearch": (), "Oracle": (), "Kafka": (), "RabbitMQ": (),
    "AWS": ("amazon web services",), "Azure": (), "GCP": ("google cloud",),
    "Docker": (), "Kubernetes": ("k8s",), "Terraform": (), "Jenkins": (), "CI/CD": ("cicd",),
    "Git": (), "GitHub Actions": (), "Linux": (), "Ansible": (),
    "Machine Learning": ("ml",), "Deep Learning": (), "NLP": ("natural language processing",),
    "TensorFlow": (), "PyTorch": (), "Pandas": (), "NumPy": (), "Scikit-learn": ("sklearn",),
    "Data Analysis": ("data analytics",), "Power BI": ("powerbi",), "Tableau": (), "Excel": (),
    "Spark": ("pyspark",), "Hadoop": (), "Airflow": (), "ETL": (),
    "Selenium": (), "Cypress": (), "Playwright": (), "Jest": (), "Pytest": (),
    "Postman": (), "JMeter": (), "Test Automation": ("automation testing",),
    "Manual Testing": (), "QA": ("quality assurance",), "Appium": (),
    "Android": (), "iOS": (), "React Native": (), "Flutter": (),
    "Agile": (), "Scrum": (), "JIRA": (), "Figma": (), "UI/UX": ("ux design", "ui design"),
    "Microservices": (), "System Design": (), "Cybersecurity": ("information security",),
    "Product Management": (), "Project Management": (), "SEO": (), "Salesforce": (),
}

_ALIAS_TO_CANON: dict[str, str] = {}
for _canon, _aliases in _SKILLS.items():
    _ALIAS_TO_CANON[_canon.lower()] = _canon
    for _a in _aliases:
        _ALIAS_TO_CANON[_a.lower()] = _canon


def _pattern(term: str) -> re.Pattern:
    # Word boundaries that also work for terms ending in symbols such as C++ / C#.
    return re.compile(r"(?<![A-Za-z0-9+#])" + re.escape(term) + r"(?![A-Za-z0-9+#])", re.IGNORECASE)


_PATTERNS = {term: _pattern(term) for term in _ALIAS_TO_CANON}
# Single letters / very short ambiguous aliases only match in their canonical casing.
_CASE_SENSITIVE = {"c", "r", "go", "js", "ts", "ml", "node", "rest", "spring", "qa"}


def canonical_skill(name: str) -> str:
    """Map a user-typed skill onto the canonical spelling when we know it."""
    return _ALIAS_TO_CANON.get(name.strip().lower(), name.strip())


def extract_skills(text: str) -> list[str]:
    """Detect known skills mentioned in free text, in vocabulary order."""
    found: dict[str, None] = {}
    for term, pattern in _PATTERNS.items():
        canon = _ALIAS_TO_CANON[term]
        if canon in found:
            continue
        if term in _CASE_SENSITIVE:
            if re.search(r"(?<![A-Za-z0-9+#])" + re.escape(canon) + r"(?![A-Za-z0-9+#])", text):
                found[canon] = None
        elif pattern.search(text):
            found[canon] = None
    return list(found)


def normalize_skills(skills: Iterable[str]) -> set[str]:
    return {canonical_skill(s).lower() for s in skills if s and s.strip()}


class ResumeError(ValueError):
    pass


ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}


def extract_resume_text(filename: str, data: bytes) -> str:
    """Return plain text from a PDF, DOCX or TXT resume."""
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise ResumeError("Unsupported file type. Upload a PDF, DOCX or TXT resume.")
    try:
        if ext == ".pdf":
            if not data.startswith(b"%PDF"):
                raise ResumeError("This file is not a valid PDF.")
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(data))
            text = "\n".join((page.extract_text() or "") for page in reader.pages)
        elif ext == ".docx":
            if not data.startswith(b"PK"):
                raise ResumeError("This file is not a valid DOCX document.")
            from docx import Document
            doc = Document(io.BytesIO(data))
            parts = [p.text for p in doc.paragraphs]
            for table in doc.tables:
                for row in table.rows:
                    parts.extend(cell.text for cell in row.cells)
            text = "\n".join(parts)
        else:
            text = data.decode("utf-8", errors="ignore")
    except ResumeError:
        raise
    except Exception as exc:
        raise ResumeError("We couldn't read that file. Try exporting it again as PDF or DOCX.") from exc
    text = text.replace("\x00", "").strip()
    if not text:
        raise ResumeError("No readable text found in the resume (scanned images aren't supported).")
    return text[:200_000]
