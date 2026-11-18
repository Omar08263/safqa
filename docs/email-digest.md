# Safqa email digest — opt-in only

The live site is a free static Space with no server that could store email
addresses, so subscription is **double opt-in by email**:

1. On `/#/radar` the visitor types their address, ticks an explicit consent box,
   and Safqa opens a pre-filled email to **rxcc@agentmail.to** with the subject
   `SAFQA SUBSCRIBE`. Sending it from their own mailbox proves the address is
   theirs and that they asked.
2. Sending `UNSUBSCRIBE` (any subject/body containing it) from the same address
   removes them before the next send. Every digest repeats this instruction.
3. `npx tsx deploy/hf/email-digest.ts` builds `digest.html` / `digest.txt` from
   the latest real snapshot. **It never sends anything.**
4. Sending is a separate, owner-approved routine: list senders of
   `SAFQA SUBSCRIBE` in the inbox, subtract senders of `UNSUBSCRIBE`, and send the
   built digest from rxcc@agentmail.to to that list only. Nobody else is emailed.

Free-tier limits of the inbox provider apply (daily send caps); if the list grows
past them the digest is sent in batches over several days.
