"""
Author: Kishore Kumar
Sample job catalogue.

Platforms don't offer public apply APIs, so the job feed is a built-in catalogue
that stands in for the scrapers/partner feeds. Each posting links to the
platform's live search for that role.
"""

from datetime import datetime, timedelta
from itertools import cycle
from urllib.parse import quote_plus

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Job

_ROLES = [
    ("Python Backend Developer", ["Python", "FastAPI", "PostgreSQL", "Docker", "REST API"], "full_time", 12, 24),
    ("Senior Python Engineer", ["Python", "Django", "AWS", "Microservices", "PostgreSQL"], "full_time", 22, 38),
    ("Full Stack Developer", ["React", "Node.js", "TypeScript", "MongoDB", "REST API"], "full_time", 10, 22),
    ("Frontend Engineer", ["React", "TypeScript", "Tailwind CSS", "HTML", "CSS"], "full_time", 9, 20),
    ("React Developer", ["React", "JavaScript", "Redux", "HTML", "CSS"], "full_time", 8, 18),
    ("Java Backend Developer", ["Java", "Spring Boot", "MySQL", "Microservices", "Kafka"], "full_time", 12, 28),
    ("DevOps Engineer", ["AWS", "Docker", "Kubernetes", "Terraform", "CI/CD"], "full_time", 14, 30),
    ("Cloud Engineer", ["AWS", "Azure", "Terraform", "Linux", "Docker"], "full_time", 12, 26),
    ("Data Analyst", ["SQL", "Python", "Power BI", "Excel", "Tableau"], "full_time", 6, 14),
    ("Data Scientist", ["Python", "Machine Learning", "Pandas", "Scikit-learn", "SQL"], "full_time", 14, 32),
    ("Machine Learning Engineer", ["Python", "PyTorch", "TensorFlow", "Machine Learning", "Docker"], "full_time", 18, 40),
    ("Data Engineer", ["Python", "Spark", "Airflow", "SQL", "AWS"], "full_time", 14, 30),
    ("QA Automation Engineer", ["Selenium", "Python", "Pytest", "Test Automation", "JIRA"], "full_time", 7, 18),
    ("SDET", ["Java", "Selenium", "Appium", "CI/CD", "Test Automation"], "full_time", 10, 22),
    ("Android Developer", ["Android", "Kotlin", "Java", "REST API", "Git"], "full_time", 10, 24),
    ("iOS Developer", ["iOS", "Swift", "REST API", "Git", "Agile"], "full_time", 10, 24),
    ("Flutter Developer", ["Flutter", "REST API", "Git", "Agile", "Android"], "contract", 8, 20),
    ("UI/UX Designer", ["Figma", "UI/UX", "HTML", "CSS", "Agile"], "full_time", 6, 18),
    ("Product Manager", ["Product Management", "Agile", "JIRA", "SQL", "Scrum"], "full_time", 18, 42),
    ("Software Engineering Intern", ["Python", "JavaScript", "Git", "SQL", "HTML"], "internship", 2, 4),
    ("Site Reliability Engineer", ["Linux", "Kubernetes", "Python", "AWS", "CI/CD"], "full_time", 16, 36),
    ("Golang Developer", ["Go", "Microservices", "Docker", "PostgreSQL", "Kafka"], "full_time", 14, 30),
    ("Cybersecurity Analyst", ["Cybersecurity", "Linux", "Python", "AWS", "Bash"], "full_time", 9, 22),
    ("Salesforce Developer", ["Salesforce", "SQL", "JavaScript", "Agile", "REST API"], "full_time", 8, 20),
]
_COMPANIES = [
    "Infosys", "TCS", "Wipro", "Accenture", "Cognizant", "Zoho", "Freshworks", "Razorpay",
    "Swiggy", "Flipkart", "Paytm", "PhonePe", "Atlassian", "Thoughtworks", "Mindtree", "HCLTech",
    "Capgemini", "Zomato", "Myntra", "Postman",
]
_LOCATIONS = [
    ("Bengaluru", False), ("Chennai", False), ("Hyderabad", False), ("Pune", False),
    ("Mumbai", False), ("Delhi NCR", False), ("Coimbatore", False), ("Kochi", False),
    ("Remote", True), ("Bengaluru", False), ("Chennai", False), ("Remote", True),
]
_PLATFORMS = ["linkedin", "naukri", "indeed", "glassdoor", "foundit", "instahyre"]
_SEARCH_URL = {
    "linkedin": "https://www.linkedin.com/jobs/search/?keywords={q}",
    "naukri": "https://www.naukri.com/{slug}-jobs",
    "indeed": "https://in.indeed.com/jobs?q={q}",
    "glassdoor": "https://www.glassdoor.co.in/Job/jobs.htm?sc.keyword={q}",
    "foundit": "https://www.foundit.in/srp/results?query={q}",
    "instahyre": "https://www.instahyre.com/search-jobs/?q={q}",
}


def _build() -> list[dict]:
    companies, locations, platforms = cycle(_COMPANIES), cycle(_LOCATIONS), cycle(_PLATFORMS)
    jobs: list[dict] = []
    # Two postings per role on different platforms/locations keeps the feed varied.
    for round_no in range(2):
        for i, (title, skills, jtype, smin, smax) in enumerate(_ROLES):
            company, (loc, remote), platform = next(companies), next(locations), next(platforms)
            q = quote_plus(title)
            url = _SEARCH_URL[platform].format(q=q, slug=title.lower().replace(" ", "-").replace("/", "-"))
            jobs.append({
                "external_id": f"sample-{round_no}-{i}",
                "title": title, "company": company,
                "location": "Remote" if remote else loc, "is_remote": remote,
                "description": (
                    f"{company} is hiring a {title}. You will build and ship production features, "
                    f"collaborate with cross-functional teams and own quality end to end. "
                    f"Key skills: {', '.join(skills)}."
                ),
                "skills": skills, "job_type": jtype, "source": platform, "job_url": url,
                "salary_min_lpa": float(smin + round_no), "salary_max_lpa": float(smax + round_no * 2),
                "experience_min": 0 if jtype == "internship" else 1 + (i % 4),
                "experience_max": 1 if jtype == "internship" else 4 + (i % 5),
                "posted_date": datetime.utcnow() - timedelta(days=(i * 2 + round_no * 3) % 14),
            })
    return jobs


async def seed_sample_jobs(db: AsyncSession) -> int:
    """Insert the catalogue once; safe to call on every startup."""
    existing = await db.scalar(select(func.count(Job.id)).where(Job.external_id.like("sample-%")))
    if existing:
        return 0
    for data in _build():
        db.add(Job(**data))
    await db.commit()
    return len(_build())
