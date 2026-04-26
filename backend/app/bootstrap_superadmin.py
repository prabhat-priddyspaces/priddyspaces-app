from __future__ import annotations

import argparse
import getpass

from app.db.session import SessionLocal
from app.services.platform_auth import bootstrap_first_superadmin


def main() -> int:
    parser = argparse.ArgumentParser(description="Bootstrap the first Priddyspaces superadmin")
    parser.add_argument("--email", required=True, help="Email for the first superadmin")
    parser.add_argument(
        "--password",
        help="Optional initial password for direct email/password login",
    )
    parser.add_argument(
        "--prompt-password",
        action="store_true",
        help="Prompt securely for the initial password instead of passing it on the command line",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Override an existing superadmin assignment",
    )
    args = parser.parse_args()
    if args.password and args.prompt_password:
        parser.error("Use either --password or --prompt-password, not both")
    password = args.password
    if args.prompt_password:
        password = getpass.getpass("Initial password: ")
        confirm = getpass.getpass("Confirm password: ")
        if password != confirm:
            print("Passwords did not match")
            return 1
        if not password:
            print("Password cannot be empty")
            return 1

    db = SessionLocal()
    try:
        user, member, created = bootstrap_first_superadmin(
            db,
            email=args.email,
            force=args.force,
            password=password,
        )
    except RuntimeError as exc:
        print(str(exc))
        return 1
    finally:
        db.close()

    action = "created" if created else "already exists"
    print(
        f"Superadmin {action}: email={user.email} role={member.role.value} "
        f"user_public_id={user.public_id} member_public_id={member.public_id} "
        f"password_ready={'yes' if user.password_hash else 'no'}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
