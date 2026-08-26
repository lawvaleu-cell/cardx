"""vCard 3.0 (.vcf) generation — pure Python, no dependencies."""


def _escape(v):
    if not v:
        return ""
    return (
        str(v)
        .replace("\\", "\\\\")
        .replace(",", "\\,")
        .replace(";", "\\;")
        .replace("\n", "\\n")
    )


def build_vcard(card, social_links=None):
    social_links = social_links or []
    first = _escape(card["first_name"])
    last = _escape(card["last_name"])
    full = f"{card['first_name']} {card['last_name']}".strip()

    lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        f"N:{last};{first};;;",
        f"FN:{_escape(full)}",
    ]
    if card["company"]:
        lines.append(f"ORG:{_escape(card['company'])}")
    if card["job_title"]:
        lines.append(f"TITLE:{_escape(card['job_title'])}")
    if card["phone"]:
        lines.append(f"TEL;TYPE=CELL,VOICE:{_escape(card['phone'])}")
    if card["whatsapp"] and card["whatsapp"] != card["phone"]:
        lines.append(f"TEL;TYPE=WHATSAPP,VOICE:{_escape(card['whatsapp'])}")
    if card["email"]:
        lines.append(f"EMAIL;TYPE=INTERNET:{_escape(card['email'])}")
    if card["website"]:
        lines.append(f"URL:{_escape(card['website'])}")
    if card["address"]:
        lines.append(f"ADR;TYPE=WORK:;;{_escape(card['address'])};;;;")
    if card["bio"]:
        lines.append(f"NOTE:{_escape(card['bio'])}")

    for link in social_links:
        lines.append(f"X-SOCIALPROFILE;TYPE={link['platform']}:{_escape(link['url'])}")

    lines.append("END:VCARD")
    return "\r\n".join(lines) + "\r\n"
