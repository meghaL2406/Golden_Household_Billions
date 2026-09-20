"""AI assistant — mock implementation ("coming soon").

The endpoints, request and response shapes are final; only the answer generation is a placeholder.
Replacing `_mock_reply` with a call to a language model (with the family profile and scheme rules as
context) is the intended next step, and nothing in the frontend needs to change for that.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import User
from .deps import my_family

router = APIRouter(prefix="/assistant", tags=["assistant"])


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


SUGGESTIONS_CITIZEN = [
    "Which schemes is my family eligible for?",
    "How do I add a newborn without Aadhaar?",
    "My benefit has not arrived. What can I do?",
    "What documents do I still need to upload?",
]
SUGGESTIONS_OFFICER = [
    "Summarise the open duplicate-identity cases",
    "Which schemes have the most pending applications?",
    "Explain how the eligibility engine decides",
    "Show families awaiting verification in my district",
]


@router.get("/status")
def status(user: User = Depends(get_current_user)):
    return {
        "available": False,
        "mode": "mock",
        "title": "AI assistant",
        "message": "Coming soon. This preview answers from fixed samples and is not connected to a language model.",
        "suggestions": SUGGESTIONS_CITIZEN if user.role == "CITIZEN" else SUGGESTIONS_OFFICER,
    }


@router.post("/chat")
def chat(body: ChatIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    fam = my_family(db, user) if user.role == "CITIZEN" else None
    reply, links = _mock_reply(body.message, user, fam)
    return {
        "reply": reply,
        "links": links,
        "mock": True,
        "at": datetime.now(timezone.utc).isoformat(),
    }


def _mock_reply(text: str, user: User, fam) -> tuple[str, list[dict]]:
    t = text.lower()
    officer = user.role != "CITIZEN"
    prefix = "/officer" if officer else ""
    code = f" (Family ID {fam.family_code})" if fam is not None and fam.family_code else ""

    if any(k in t for k in ("eligib", "scheme", "qualify")):
        if officer:
            return ("Scheme eligibility is evaluated by the rule engine for every verified and pending family. "
                    "The Schemes page lists each scheme with its rules, and the Reports page shows eligible, "
                    "needs-document and under-review counts per scheme.",
                    [{"label": "Schemes", "to": "/officer/schemes"}, {"label": "Reports", "to": "/officer/reports"}])
        return (f"Your family's{code} eligibility is recalculated automatically whenever the profile changes. "
                "The Schemes page shows every scheme with a plain reason: eligible, not eligible, needs a document, "
                "or under review.",
                [{"label": "Open Schemes", "to": "/schemes"}])
    if any(k in t for k in ("newborn", "birth", "baby", "aadhaar")):
        return ("A newborn under one year old is the one member who can be added without Aadhaar. Report a birth "
                "from the Family page, attach the birth certificate, and the child is added as a provisional member; "
                "an officer verifies it and the Aadhaar number can be linked later. Every other member needs Aadhaar.",
                [{"label": "Family profile", "to": f"{prefix}/family" if not officer else "/officer/families"}])
    if any(k in t for k in ("not arrived", "not received", "grievance", "complaint", "delay")):
        return ("If a sanctioned benefit has not reached you, open Benefits and choose \"I have not received it\". "
                "A grievance is opened automatically with a seven-day due date and an escalation path, and you can "
                "track and rate it under Support.",
                [{"label": "Benefits", "to": "/benefits"}, {"label": "Support", "to": "/support"}])
    if any(k in t for k in ("document", "upload", "certificate", "proof")):
        return ("Missing documents are listed against each scheme on the Schemes page, and you can upload them from "
                "the Documents tab of the Family page. Uploaded documents are verified by an officer before they "
                "count towards eligibility.",
                [{"label": "Family documents", "to": "/family"}])
    if any(k in t for k in ("duplicate", "fraud", "rajesh", "rakesh")):
        return ("Possible duplicate identities are scored on name similarity, date of birth, parent name, mobile, "
                "Aadhaar and locality. Anything above the review threshold is held as a verification case with the "
                "evidence side by side, rather than being accepted.",
                [{"label": "Verification cases", "to": "/officer/cases"}] if officer else [])
    if any(k in t for k in ("verification", "pending", "district", "case")):
        return ("Open cases are in the Verification queue, filterable by type, priority and district, with an "
                "\"Assigned to me\" toggle. Approving a family verification issues the Family ID and recalculates "
                "eligibility.",
                [{"label": "Verification", "to": "/officer/cases"}])
    if any(k in t for k in ("hello", "hi", "help", "what can you")):
        who = "officer" if officer else "citizen"
        return (f"Hello {user.name}. I am a preview of the Family ID assistant for {who}s. I can point you to the "
                "right page for eligibility, documents, life events, benefits and grievances. Full answers from a "
                "language model are coming soon.", [])
    return ("I am a preview and can only answer a few sample questions for now: eligibility, adding a newborn, "
            "missing documents, benefits that have not arrived, and verification cases. A full assistant is "
            "coming soon.", [])
