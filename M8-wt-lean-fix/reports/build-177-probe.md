# B-177 Groq migration — live probe verdict

Date: 2026-07-03T11:37:47.369Z

Each shape runs through the REAL `lib/llm.js generate()` (providerOrder:"groq"),
GROQ_MODEL swapped per run; gpt-oss BARE flips M8_GROQ_QUIRKS=0 to show the trap.

| model run | A-chat | B-arbiter | C-task | verdict |
|---|---|---|---|---|
| llama-3.3-baseline | PASS (535ms) | PASS (502ms) | PASS (430ms) | ADOPTABLE |
| gpt-oss-120b-bare | PASS (743ms) | PASS (713ms) | FAIL:parser-fail (573ms) | reject |
| gpt-oss-120b-quirks | PASS (453ms) | PASS (421ms) | PASS (783ms) | ADOPTABLE |
| qwen3.6-27b-quirks | PASS (141ms) | PASS (145ms) | PASS (178ms) | ADOPTABLE |
| llama-3.1-8b | PASS (137ms) | PASS (146ms) | PASS (175ms) | ADOPTABLE |

- baseline llama-3.3 all shapes pass: **true**
- gpt-oss-120b BARE all pass: **false** (expected false — the 06-30 trap)

**DECISION (§3 tree): openai/gpt-oss-120b  (branch 1 — expected)**

<details><summary>samples</summary>

```json
{
  "llama-3.3-baseline": {
    "note": "BASELINE (alive until 2026-08-16)",
    "model": "llama-3.3-70b-versatile",
    "shapes": {
      "A-chat": {
        "canaries": [
          {
            "name": "EN",
            "pass": true,
            "ms": 535,
            "sample": "Paris.",
            "reason": "ok"
          },
          {
            "name": "AR",
            "pass": true,
            "ms": 167,
            "sample": "باريس.",
            "reason": "ok"
          }
        ],
        "pass": true
      },
      "B-arbiter": {
        "canaries": [
          {
            "name": "wallet",
            "pass": true,
            "ms": 502,
            "sample": "{ \"domain\": \"wallet\" }",
            "reason": "ok"
          }
        ],
        "pass": true
      },
      "C-task": {
        "canaries": [
          {
            "name": "EN",
            "pass": true,
            "ms": 416,
            "sample": "{ \"op\": \"add\", \"command\": \"remind me to check the oil tomorrow at 9am\" }",
            "reason": "ok"
          },
          {
            "name": "AR",
            "pass": true,
            "ms": 430,
            "sample": "{ \"op\": \"add\", \"command\": \"remind me to أفحص الزيت بكرة الساعة ٩\" }",
            "reason": "ok"
          }
        ],
        "pass": true
      }
    },
    "allPass": true
  },
  "gpt-oss-120b-bare": {
    "note": "documents the 06-30 blank trap",
    "model": "openai/gpt-oss-120b",
    "shapes": {
      "A-chat": {
        "canaries": [
          {
            "name": "EN",
            "pass": true,
            "ms": 483,
            "sample": "Paris",
            "reason": "ok"
          },
          {
            "name": "AR",
            "pass": true,
            "ms": 743,
            "sample": "باريس",
            "reason": "ok"
          }
        ],
        "pass": true
      },
      "B-arbiter": {
        "canaries": [
          {
            "name": "wallet",
            "pass": true,
            "ms": 713,
            "sample": "{\"domain\":\"wallet\"}",
            "reason": "ok"
          }
        ],
        "pass": true
      },
      "C-task": {
        "canaries": [
          {
            "name": "EN",
            "pass": true,
            "ms": 567,
            "sample": "{\"op\":\"add\",\"command\":\"remind me to check the oil tomorrow at 9am\"}",
            "reason": "ok"
          },
          {
            "name": "AR",
            "pass": false,
            "ms": 573,
            "sample": "ERR: All LLM providers failed → groq: groq 400: {\"error\":{\"message\":\"Failed to validate JSON. P",
            "reason": "parser-fail"
          }
        ],
        "pass": false
      }
    },
    "allPass": false
  },
  "gpt-oss-120b-quirks": {
    "note": "PRIMARY candidate + quirks",
    "model": "openai/gpt-oss-120b",
    "shapes": {
      "A-chat": {
        "canaries": [
          {
            "name": "EN",
            "pass": true,
            "ms": 453,
            "sample": "Paris",
            "reason": "ok"
          },
          {
            "name": "AR",
            "pass": true,
            "ms": 408,
            "sample": "باريس",
            "reason": "ok"
          }
        ],
        "pass": true
      },
      "B-arbiter": {
        "canaries": [
          {
            "name": "wallet",
            "pass": true,
            "ms": 421,
            "sample": "{\"domain\":\"wallet\"}",
            "reason": "ok"
          }
        ],
        "pass": true
      },
      "C-task": {
        "canaries": [
          {
            "name": "EN",
            "pass": true,
            "ms": 491,
            "sample": "{\"op\":\"add\",\"command\":\"remind me to check the oil tomorrow at 9am\"}",
            "reason": "ok"
          },
          {
            "name": "AR",
            "pass": true,
            "ms": 783,
            "sample": "{\"op\":\"add\",\"command\":\"remind me to أفحص الزيت بكرة الساعة ٩\"}",
            "reason": "ok"
          }
        ],
        "pass": true
      }
    },
    "allPass": true
  },
  "qwen3.6-27b-quirks": {
    "note": "fallback #1 + quirks",
    "model": "qwen/qwen3.6-27b",
    "shapes": {
      "A-chat": {
        "canaries": [
          {
            "name": "EN",
            "pass": true,
            "ms": 133,
            "sample": "Paris",
            "reason": "ok"
          },
          {
            "name": "AR",
            "pass": true,
            "ms": 141,
            "sample": "باريس",
            "reason": "ok"
          }
        ],
        "pass": true
      },
      "B-arbiter": {
        "canaries": [
          {
            "name": "wallet",
            "pass": true,
            "ms": 145,
            "sample": "{\"domain\":\"wallet\"}",
            "reason": "ok"
          }
        ],
        "pass": true
      },
      "C-task": {
        "canaries": [
          {
            "name": "EN",
            "pass": true,
            "ms": 178,
            "sample": "{\"op\":\"add\",\"command\":\"remind me to check the oil tomorrow at 9am\"}",
            "reason": "ok"
          },
          {
            "name": "AR",
            "pass": true,
            "ms": 166,
            "sample": "{\"op\":\"add\",\"command\":\"remind me to أفحص الزيت بكرة الساعة ٩\"}",
            "reason": "ok"
          }
        ],
        "pass": true
      }
    },
    "allPass": true
  },
  "llama-3.1-8b": {
    "note": "fallback #2 (floor, no quirks)",
    "model": "llama-3.1-8b-instant",
    "shapes": {
      "A-chat": {
        "canaries": [
          {
            "name": "EN",
            "pass": true,
            "ms": 120,
            "sample": "Paris.",
            "reason": "ok"
          },
          {
            "name": "AR",
            "pass": true,
            "ms": 137,
            "sample": "باريس.",
            "reason": "ok"
          }
        ],
        "pass": true
      },
      "B-arbiter": {
        "canaries": [
          {
            "name": "wallet",
            "pass": true,
            "ms": 146,
            "sample": "{ \"domain\": \"wallet\" }",
            "reason": "ok"
          }
        ],
        "pass": true
      },
      "C-task": {
        "canaries": [
          {
            "name": "EN",
            "pass": true,
            "ms": 154,
            "sample": "{ \"op\": \"add\", \"command\": \"remind me to check the oil tomorrow at 9am\" }",
            "reason": "ok"
          },
          {
            "name": "AR",
            "pass": true,
            "ms": 175,
            "sample": "{ \"op\": \"add\", \"command\": \"remind me to أفحص الزيت بكرة الساعة ٩\" }",
            "reason": "ok"
          }
        ],
        "pass": true
      }
    },
    "allPass": true
  }
}
```
</details>
