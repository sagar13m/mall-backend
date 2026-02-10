# Offline Gift Card Brand Mapping for Shopping Malls (Backend)

## 📌 Project Overview

This backend project identifies offline gift card brands available inside shopping malls by matching brand names with mall store directories.

Store names inside malls often contain variations like:
- Mall names
- City names
- Extra words such as `store`, `outlet`, `world`, `exclusive`, `showroom`

Because of this, **exact string matching does not work**.

This project implements a **data normalization + fuzzy matching pipeline** to accurately detect brand presence and store results in AWS DynamoDB.

### Final Output

The final output stores:
- One record per mall
- A list of gift card brands found in that mall
- The specific store name where each brand was detected

This data is used for **offline gift card enablement**.

---

## 🎯 Objective (As per Task Brief)

For each shopping mall:
- ✅ Identify offline gift card brands present
- ✅ Use only the provided datasets (no external data)
- ✅ Handle store name variations correctly
- ✅ Save results into the database as:
  - One record per mall
  - Each record must contain at least one brand
  - Skip malls with no matching brands
  - Avoid duplicate brands inside a mall
- ✅ Accuracy prioritized over speed

---

## 📂 Data Sources Used

### 1. Mall Dataset (JSON)

Contains:
- Mall name
- City and state
- Store directory collected from Google Maps

**Example store names:**
```
Titan World – Brigade Orion Mall
VERO MODA – Bengaluru – Orion Mall
W For Woman
Victoria's Secret
```

These names include extra text, so **normalization is required** before matching.

### 2. Brand Dataset (CSV)

Contains:
- Brand name
- Product ID (optional)
- Known brand variations
- Offline redeem URL (optional)

**If Product ID is missing**, the system generates a deterministic ID.

---

## ⚙️ Backend Architecture

The system consists of two main components:

### 1️⃣ Batch Mapping Pipeline

Processes mall + brand datasets:
```
jobs/processAllMalls.js
```

**Responsibilities:**
- Load mall JSON data
- Parse brand CSV data
- Normalize brand/store names
- Match brands against mall stores
- Save results to DynamoDB

### 2️⃣ Serverless Read API

Provides API endpoints to retrieve mapped data:
```
GET /api/malls
GET /api/malls/{mallKey}
```

**Used for:**
- Listing mapped malls
- Fetching mall brand details

---

## 📁 Project Structure

```
project-root/
│
├── jobs/
│   └── processAllMalls.js      # Main mapping pipeline
|   └── datasets                # JSON + CSV datasets
│    
├── services/
│   ├── matcher.js              # Brand matching logic
│   └── writer.js               # DynamoDB write logic

├── handlers/
│   ├── malls.js                # API handlers
│
├── utils/
│   └── normalize.js            # Text normalization utilities
│
├── ddb.js                      # DynamoDB client config
├── serverless.yml              # Serverless deployment config
├── package.json
```

---

## 🔎 Detailed Matching Process

### Step 1 — Load Data

- Mall JSON dataset
- Brand CSV dataset
- CSV headers are auto-detected to support different formats

### Step 2 — Brand Row Mapping

Each CSV row is converted into:

```javascript
{
  brandName,
  productId,
  variations,
  offlineRedeemUrl
}
```

**If productId is missing:**
- SHA-1 hash of lowercase brand name
- First 12 characters used as stable ID
- This ensures deterministic product IDs

### Step 3 — Text Normalization

**Implemented in:** `utils/normalize.js`

Normalization includes:
- Lowercasing text
- Removing punctuation
- Removing noise words such as:
  ```
  mall, store, outlet, exclusive, showroom,
  ltd, india, plaza, complex, center, road, floor
  ```

**Example:**
```
"Titan World Orion Mall" → "titan"
```

### Step 4 — Brand Matching Algorithm

**Implemented in:** `services/matcher.js`

#### Candidate Generation

Each brand creates multiple candidates:
- Brand name
- Known variations
- Aliases from CSV

**Supports multiple delimiters:** `|`, `;`, `,`, `/`

#### Similarity Scoring

Uses **token overlap score** (0–100):

```
score = 2 × common_tokens / total_tokens
```

This handles:
- Extra words in store names
- Different ordering
- Partial matches

#### Short Brand Protection

Very short brands (e.g., "W"):
- Require exact word boundary match
- Require higher similarity threshold (~85)
- This prevents false positives

### Step 5 — Mall-Level Matching Rules

For each mall:
1. Iterate through all store names
2. Find best matching store per brand
3. If score ≥ threshold (default 70):
   - → Brand considered present
4. Each brand appears **only once** per mall

### Step 6 — DynamoDB Storage

**Handled by:** `services/writer.js`

**Rules enforced:**
- One record per mall
- Skip malls without brands
- Deduplicate brands
- Refuse to save empty product lists

---

## 🗄 DynamoDB Schema

Each mall record:

```json
{
  "pk": "MALL#orion mall|bengaluru|karnataka",
  "sk": "META",
  "mallName": "Orion Mall",
  "city": "Bengaluru",
  "state": "Karnataka",
  "products": [
    {
      "brandName": "Titan",
      "productId": "abc123xyz",
      "storeName": "Titan World - Orion Mall"
    }
  ],
  "createdAt": "timestamp"
}
```

### Key Design Decisions

- **Stable mallKey** → `normalized name|city|state`
- **Deterministic product IDs**
- **Single META record per mall**

This ensures **idempotent batch runs**.

---

## 🚀 Running the Project

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create `.env`:

```env
AWS_REGION=us-east-1
DDB_TABLE=OfflineBrandMapping
MATCH_THRESHOLD=70
```

**Notes:**
- Threshold defaults to 70 if not set
- Table name required for DynamoDB writes

### 3. Run Mapping Job

```bash
npm run map
```

This will:
- Load datasets
- Match brands to malls
- Save results into DynamoDB

---

## 🌐 Running API Locally

```bash
npx serverless offline
```

**Endpoints:**
- `GET /api/malls`
- `GET /api/malls/{mallKey}`

---

## 🧠 Engineering Decisions & Highlights

### Deterministic Data Processing
- Stable keys for malls and brands
- Safe reprocessing without duplicates

### Accuracy-Focused Matching
- Noise-word removal
- Token similarity scoring
- Special handling for short brands

### Database Integrity Controls
- No empty records
- No duplicate brands
- Consistent schema

---

## ⚠️ Known Limitations

- Token overlap matching (not embeddings)
- Offline redeem URLs parsed but not stored
- Depends on input dataset quality

---

## 👨‍💻 What I Implemented (Backend Scope)

- ✅ Data ingestion pipeline
- ✅ Brand normalization + fuzzy matching engine
- ✅ Deterministic product ID generation
- ✅ DynamoDB storage design
- ✅ Batch processing workflow
- ✅ Serverless API endpoints
- ✅ Full backend integration for offline gift card mapping

---
