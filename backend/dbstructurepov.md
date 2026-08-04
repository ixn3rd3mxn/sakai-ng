# 📊 EMS Database Schema
*Generated: 2026-08-04 11:12:24*

---

## 📋 Collections Overview

| **Collection** | **Description** | **Fields Count** | **Doc Count** |
|---------------|----------------|------------------|----------------|
| `call_types` | ประเภทการแจ้งเหตุ (Call Types) | 3 | 5 |
| `case_types` | ประเภทเคส (Case Types) | 3 | 2 |
| `cbd_categories` | CBD Categories (Chief Complaint Based Dispatch) | 4 | 25 |
| `incidents` | ข้อมูลเหตุการณ์ฉุกเฉิน (Incidents) | 9 | 10 |
| `reporting_channels` | ช่องทางการแจ้ง (Reporting Channels) | 3 | 3 |
| `severity_levels` | ระดับความรุนแรง (Severity Levels) | 4 | 5 |

---

## 📄 `call_types`

*ประเภทการแจ้งเหตุ (Call Types) — 5 documents*

| **Field** | **Type(s)** | **Description** |
|----------|-------------|----------------|
| `_id` | ObjectId |  |
| `call_id` | int |  |
| `call_name` | str |  |

**🔍 Indexes:**
- *(no secondary indexes)*

---

## 📄 `case_types`

*ประเภทเคส (Case Types) — 2 documents*

| **Field** | **Type(s)** | **Description** |
|----------|-------------|----------------|
| `_id` | ObjectId |  |
| `case_id` | int |  |
| `case_name` | str |  |

**🔍 Indexes:**
- *(no secondary indexes)*

---

## 📄 `cbd_categories`

*CBD Categories (Chief Complaint Based Dispatch) — 25 documents*

| **Field** | **Type(s)** | **Description** |
|----------|-------------|----------------|
| `_id` | ObjectId |  |
| `cbd_des` | str |  |
| `cbd_id` | int |  |
| `cbd_name` | str |  |

**🔍 Indexes:**
- *(no secondary indexes)*

---

## 📄 `incidents`

*ข้อมูลเหตุการณ์ฉุกเฉิน (Incidents) — 10 documents*

| **Field** | **Type(s)** | **Description** |
|----------|-------------|----------------|
| `_id` | ObjectId | MongoDB primary key |
| `call_id` | int |  |
| `case_id` | int | รหัสเคสอ้างอิง |
| `cbd_id` | int |  |
| `channel_id` | int |  |
| `hour` | str |  |
| `incident_id` | str |  |
| `severity_id` | int |  |
| `timestamp` | datetime |  |

**🔍 Indexes:**
- `timestamp_-1`: (`timestamp`)
- `hour_1`: (`hour`)
- `call_id_1`: (`call_id`)
- `channel_id_1`: (`channel_id`)
- `case_id_1`: (`case_id`)
- `cbd_id_1`: (`cbd_id`)
- `severity_id_1`: (`severity_id`)

---

## 📄 `reporting_channels`

*ช่องทางการแจ้ง (Reporting Channels) — 3 documents*

| **Field** | **Type(s)** | **Description** |
|----------|-------------|----------------|
| `_id` | ObjectId |  |
| `channel_id` | int |  |
| `channel_name` | str |  |

**🔍 Indexes:**
- *(no secondary indexes)*

---

## 📄 `severity_levels`

*ระดับความรุนแรง (Severity Levels) — 5 documents*

| **Field** | **Type(s)** | **Description** |
|----------|-------------|----------------|
| `_id` | ObjectId |  |
| `severity_des` | str |  |
| `severity_id` | int |  |
| `severity_name` | str |  |

**🔍 Indexes:**
- *(no secondary indexes)*

---

