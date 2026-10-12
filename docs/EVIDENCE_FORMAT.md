# Bounded release manifest v1

Every submitted Git commit must contain the frozen `manifest_path` with UTF-8 JSON no larger than 24 KiB. The SHA-256 of the exact raw bytes is submitted onchain. The manifest is a full snapshot, not a patch.

```json
{
  "version": 1,
  "period": 2,
  "title": "October public feed",
  "records": [
    {"id": "route-1", "value": "Open 06:00–22:00"}
  ],
  "changes": [
    {"id": "route-1", "kind": "corrected", "reason": "Hours changed from 07:00–21:00 to 06:00–22:00 after the timetable revision."}
  ]
}
```

The first passing epoch establishes a baseline. Later reviews compare all record IDs and values with the most recent passing release. Each added, corrected, or removed ID must be acknowledged; validators evaluate whether the reason materially describes the actual change. Up to 20 records and 20 change disclosures are allowed in the MVP. Duplicate IDs, malformed JSON, missing fields, or hash mismatches cannot pass. The publisher is responsible for publishing the immutable Git commit; a moving branch URL is never sufficient evidence.

