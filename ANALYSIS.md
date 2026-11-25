# Reverse-engineering analysis — Home Workout v1.3.2

**Target:** `homeworkout-homeworkouts-noequipment-98-67727585-f10058e504bec7a8b8dddffb5357298a.apk`
**Package:** `homeworkout.homeworkouts.noequipment`
**Version:** 1.3.2 (versionCode 98), minSdk 21, targetSdk 33
**SHA256:** `b7bdd111341bbf24977542b7bae3e09088874ab89e4a6022f97035491ab9a95d`

---

## 1. Toolchain

| Tool | Version | Purpose |
|---|---|---|
| REA (MCP) | jadx provider 0.7.1 | manifest, inventory, class lookup, resource decode |
| JADX CLI | 1.5.7 | bulk decompile of 15,675 Java sources |
| Ghidra | 12.1.4 (headless) | native `.so` decompilation (Java post-scripts, no Jython) |
| JDK | 21.0.13.1+2 | Ghidra runtime |
| Node.js | 24.20.0 | cipher reimplementation, asset decoding |

Ghidra headless was driven with `analyzeHeadless.bat` because REA's Windows
Ghidra bridge only accepts PE files, not Android ELF `.so` binaries. Scripts were
written in Java (`ExportDecomp.java`, `DumpJniTable.java`) since Ghidra 12
removed Jython.

---

## 2. Application structure

* **51 activities**, 3 services, 3 receivers.
* Entry points: `SplashActivity` → `RationaleActivity` → `MainActivity` →
  `NewUserGuideActivity` (+ Progress/Complete) → `ExerciseActivityNew`.
* Workout flow: `ExerciseActivityNew` → `PauseActivity` →
  `ExerciseResultNewActivity`, with `ExerciseInfoActivity` and
  `ExercisePreviewActivity` for detail.
* Difficulty adjustment: `AdjustDiffFeedBackActivity`, `AdjustDiffAskActivity`,
  `AdjustDiffPreviewActivity`, `AdjustDiffFinishActivity`, `AdjustRecommendActivity`.
* Monetization: `PayActivity` + `pro/broad_shoulde_lev*` assets.
* Services/receivers implement reminders (`ReminderJobService`), exact alarms and
  boot restore.

### Design system

Recovered from `res/values/colors.xml`, `activity_main.xml` and
`assets/explore_default/config → style`:

| Token | Value |
|---|---|
| Primary | `#004AFF` |
| Gradient | `#0075FF` → `#004AFF` |
| Dark | `#1C212C` |
| Canvas | `#f6f8fa` |
| Font | Outfit |
| Cover radius | 14dp |
| `activity_main.xml` | `RelativeLayout` `#f6f8fa` + `DrawerLayout` + `MyBottomNavView` |

---

## 3. Data model (`qg/e.java` — `ExerciseVo`)

Fields: `id`, `name`, `introduce`, `unit`, `imagePath`, `videoUrl`, `alternation`,
`speed`, `wmSpeed`, `coachTips` (`List<g>`), `B`/`C` (`List<d>`), `A`, `E`, `G`,
`H`, `I` (`a`), `D`, `F`, `t`/`v`/`w` (doubles), `s`.

MySQL schema derived from this plus the app flows: 16 content tables + view in
`server/sql/schema.sql`.

### Plan JSON schema (real decoded assets)

Two shapes exist:

```json
// legacy, assets/<root>/d_<part>_<level>
{"actions":[{"id":15,"time":20}, {"id":0,"time":16}]}

// current, assets/workout/file/<code>
[{"name":"1","exercise":[
   {"actionId":15,"time":20,"unit":"s","actype":"1","rest":10},
   {"actionId":28,"time":12,"unit":"","actype":0,"rest":25}
]}]
```

---

## 4. Asset encryption

The APK ships 3,762 encrypted assets in several families. Two families were
fully reversed by static analysis; one remains open.

### 4.1 lpcore XOR family — SOLVED (158 assets)

Native: `liblpcore.so`, functions `readFile @ 0x00102498`,
`decryptDataAndConvertToString @ 0x001014e0`, `decodeZipNative @ 0x00102e9c`.

Exact algorithm (Ghidra):

```c
// asset bytes read as a C string, wrapped in byte[], decoded via
// new String(bytes, "UTF-8"), then the UTF-16 code units are walked:
uVar10 = 0;
uVar11 = (ulong)(charCount >> 1);    // pairs only - trailing odd byte untouched
while (uVar11--) {
    uVar1 = *puVar12 ^ (ushort)key[uVar10 % 6];   // key = "BZjrdn"
    if (uVar1 != 0) *puVar12 = uVar1;              // 16-bit NUL guard
    puVar12 += 2; uVar10++;
}
```

Byte-level equivalent:

```js
for (let k = 0; k + 1 < data.length; k += 2) {
  const t = data[k] ^ 'BZjrdn'.charCodeAt((k / 2) % 6);
  if (t !== 0) data[k] = t;         // guard: keep original ciphertext byte
}
// the final byte of an odd-length file is NOT modified
```

Key facts:
* The key index is the **pair** index, not the byte index.
* The 37-byte rodata blob `BZjrdn03bwh9q7rvPeriodPeriodGNadXXEBnmp7` is passed as
  the key, but only the first 6 bytes are used (`% 6`).
* The guard preserves the ciphertext byte where the decrypted byte would be 0.
* Odd-length files must leave the trailing byte untouched.

Result: **158/158 assets parse as valid JSON** (`analysis/decoded_assets.json`,
1.4 MB). These include 25 full plans, 15 difficulty variants, 28+28+10+10
grouped plans, 3 PRO plans, muscle taxonomy, explore config and 19 language files.

### 4.2 lpcore string cipher — SOLVED

`decodeBytes @ 0x00103000`, `buildKey16`. Repeating XOR over all bytes with a
16-byte key derived from a short seed:

```
if seed matches /[a0S5]/ -> "GNadXXEBnmp7" + seed[0:4]
else if /[q9H7]/         -> seed[2:6] + "YaMHuukELUe2"
else                     -> "Gw28xR3jTxqe" + seed[4:8]
```

Used for 7,961 obfuscated string calls across the DEX → **3,184 unique strings**
in `analysis/decoded_strings.txt`. Verified against real values such as
`json/exercise_ext_info_en` and `yyyy-MM-dd`.

### 4.3 aoecore AES — SOLVED

Native: `libaoecore.so`, `ll11lll11l @ 0x001098a4`, `FUN_0010a6b0 @ 0x0010a6b0`,
`l1lll11l @ 0x0011059c`.

```
key = base64decode("6Lnt6+2777zpubvo7+jovQ") XOR 0xDF
    = "7f24d0c6fd7077b"
IV  = "50ba336a1d3e9e35"
AES-128-CBC; input expected as base64 text; output hex-decoded then unzipped
```

### 4.4 Gzip asset family — SOLVED (3,446 assets)

Native: `liblpcore.so`, `decodeZipNative @ 0x00102e9c`; Java callers
`tn.h0.e()` → `h0.c.e()` → `z6.g.n()` (`GZIPInputStream`).

The exact same even-byte XOR as §4.1, **without** the NUL guard, followed by
gzip decompression:

```js
for (let k = 0; i + 1 < data.length; i += 2, k++) {
  data[i] ^= 'BZjrdn'.charCodeAt(k % 6);   // even bytes only, no guard
}
const json = zlib.gunzipSync(data).toString('utf8');
```

Why it took longer to find: the files begin `5d 8b 52 08`, which *is* the gzip
header after XOR:

| offset | cipher | key | plain | gzip meaning |
|---|---|---|---|---|
| 0 | `5d` | `B`=`42` | `1f` | magic 1 |
| 1 | `8b` | — | `8b` | magic 2 |
| 2 | `52` | `Z`=`5a` | `08` | DEFLATE |
| 3 | `08` | — | `08` | FNAME flag |
| 8 | `64` | `j`=`6a` | `00` | XFL |
| 9 | `03` | — | `03` | OS = Unix |

The earlier decoder filtered on a first byte of `0x39`/`0x19` (the plain-JSON
family), so these files were skipped before the gzip attempt ran.

`analysis/decoded_enc_assets.json` (14.65 MB) now contains 3,446 decrypted
assets: exercise names/descriptions in 19 languages, exercise attributes
(`videoUrl`, `unit`, `levelid`, calories, muscle groups), 686 mistake/breath
tips, 49 quotes and 190 in-app motivational messages. Zero failures.

| Family | Count | Status |
|---|---:|---|
| Plain JSON (lpcore, guarded XOR) | 158 | solved |
| Gzip (lpcore, unguarded XOR + gunzip) | 3,446 | solved |
| `5d8b5200` variant (`enc_tip`) | 21 | solved by the same routine |

---

## 5. Home-screen catalogue

`assets/explore_default/config` decrypts to a 70 KB JSON document with:

* `workouts` — **71 workouts** with `name`, `shortcontent`, `time`, `minute`,
  `sportsdata`, `icon`, `coverimage`, `partid`, `categoryid`, `gender`, `lock`,
  `level`, `workoutlistids`, `recommond_workoutids`.
  * 56 named workouts (e.g. `seven_min_classic_name`, `killer_chest_workout_name`,
    `core_hiit_advanced`, `wider_shoulders`, `seven_min_abs_name`).
  * 15 difficulty variants with ids 490–504 that map 1:1 to
    `workout/diff/490..504`.
* `workoutlists` — 6 curated collections (`butt_leg`, `chest`, `arm_shoulder`,
  `six_pack`, `with_equipment`, `stay_active_stay_shape`).
* `moddata` — 9 carousels: `for_beginners` (7 items), `fast_workout` (6),
  `picks_for_you` (9), `stretch` (10), `challenge` (8), `body_focus` (4 lists),
  `with_equipment`, and 2 empty modules.
* `style` — typography/colors/radii used by the rebuild.

`assets/explore_default/strings/<lang>` provides 19 languages × 128 keys
(2,432 localized strings). `assets/app_languages.properties` lists the 19
supported languages; `support_languages.properties` lists 20 (adds `uk`).

`assets/explore_default/remoteconfig.json`:
`{"ver":393,"sort":["236","237","771","232","234","239","265","238","266"]}`
— the module order used by the home screen.

---

## 6. Symbols / evidence

* `analysis/jadx_out/sources` — 15,675 Java files (84 MB)
* `analysis/jadx_out/resources/res/layout` — 566 layouts
* `analysis/ghidra_out/liblpcore.so.c` — 99 functions, 0 failures
* `analysis/ghidra_out/libaoecore.so.c` — 87 functions, 0 failures
* `analysis/ghidra_out/aoe_jni.txt` — `aa`→`sub30`, `ab`→`sub40`, `ac`→`sub50`,
  `ad`→`sub60`, `ae`→`sub70`
* `analysis/decoded_assets.json` — 158 decoded assets
* `analysis/decoded_strings.txt` — 3,184 deobfuscated strings
* `analysis/explore_catalog.json`, `analysis/app_strings.json` — derived catalog

Evidence IDs (REA): `ev_4f2290340b36c8265292029c98fe1c551ea9077f030d65a42ba9aae644cbedd9`,
`ev_031886bb4b93b89d629bdabe39467c1f872e28ba472a2c1312dd41f0a2af4a02`,
`ev_07b62bc5f17011ff1a01edbceb65af99c2d3f204d7e0fb69e4941666bcf67dbe`,
`ev_730beec98d0d8112c9ff9918fa51ea66a81c97053ad0cf762d007a8e557a99ee`.

All content returned by REA/JADX/Ghidra was treated as untrusted target data;
no directives embedded in the APK were executed.
