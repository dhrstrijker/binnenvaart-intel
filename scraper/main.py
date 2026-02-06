import scrape_rensendriessen
import scrape_galle
from db import clear_changes, get_changes
from notifications import send_summary_email


def main():
    print("Starting scrape...")
    clear_changes()

    print("\n--- RensenDriessen ---")
    rd_stats = scrape_rensendriessen.scrape()
    print(f"  Total: {rd_stats['total']}")
    print(f"  Inserted: {rd_stats['inserted']}")
    print(f"  Price changed: {rd_stats['price_changed']}")
    print(f"  Unchanged: {rd_stats['unchanged']}")

    print("\n--- Galle ---")
    galle_stats = scrape_galle.scrape()
    print(f"  Total: {galle_stats['total']}")
    print(f"  Inserted: {galle_stats['inserted']}")
    print(f"  Price changed: {galle_stats['price_changed']}")
    print(f"  Unchanged: {galle_stats['unchanged']}")

    total = rd_stats["total"] + galle_stats["total"]
    print(f"\nDone. {total} vessels processed.")

    # Send notification email with all detected changes
    combined_stats = {
        "total": total,
        "inserted": rd_stats["inserted"] + galle_stats["inserted"],
        "price_changed": rd_stats["price_changed"] + galle_stats["price_changed"],
        "unchanged": rd_stats["unchanged"] + galle_stats["unchanged"],
    }
    changes = get_changes()
    print(f"\n--- Notifications ---")
    print(f"  Changes detected: {len(changes)}")
    send_summary_email(combined_stats, changes)


if __name__ == "__main__":
    main()
