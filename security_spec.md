# Security Specification: Guestly V1.0.1

## Data Invariants
1. Users must have a validated role. Only Super Admins can create Partners.
2. Partners and their Admins can only view and mutate their own Events, Clients, and Guests.
3. Event access is strictly bound to the `partnerId` matching the User's `partnerId`, OR the User is a Super Admin.
4. Guest RSVPs (`rsvpStatus`) can be updated publicly if the `ticketCode` is known, but standard details can only be changed by the Event owner.
5. All IDs must match `^[a-zA-Z0-9_\\-]+$`.
6. Timestamps (`createdAt`, `updatedAt`, `attendedAt`) must be enforced and immutable where applicable.
7. Any list sizes must be strictly bounded.

## The "Dirty Dozen" Payloads
1. **Identity Spoofing**: Attempt to create a user with `role: "superadmin"`.
2. **Ghost Field Injection**: Adding an unpermitted field to a Partner update.
3. **Escalation**: Partner updating their `partnerId` to access another's data.
4. **ID Poisoning**: Passing a 1.5MB string as a Document ID during read operations.
5. **Orphaned Write**: Creating an Event with a fake `partnerId` not attached to the user.
6. **Denial of Wallet**: Putting an array of 200 items in `Changelog` changes where `size() <= 20` is allowed.
7. **Type Poisoning**: Sending an integer for guest name.
8. **Blind Deletion**: Deleting a Client without checking if related Events exist (handled by rules or application logic - but at least they can't delete without Partner authorization).
9. **Event Status Bypass**: Changing an Event's `status` to a non-enum value like "deleted".
10. **State Shortcutting**: Updating a guest from `pending` straight to `attended: true` (only admins can mark attended, public can only RSVP).
11. **PII Scraping**: Blanket `list` query on `guests` without querying by `eventId` filtering down to authorized events.
12. **Temporal Forgery**: Creating a record with a `createdAt` in the past instead of `request.time`.

## Test Runner
A complete Firetore test file will be included in `firestore.rules.test.ts`.
