# RecoverAI — Intelligent Revenue Recovery Agent

RecoverAI is an AI-powered revenue recovery agent that helps businesses identify failed payments, analyze the reason for failure, predict the probability of recovery, and recommend the next best recovery action.

The system combines AI-powered decision-making, human approval, safety guardrails, and Razorpay Test Mode to create a bounded end-to-end payment recovery workflow.

## Problem Statement

Failed payments can result in significant revenue loss for businesses. Traditional payment systems can detect payment failures, but they may not intelligently determine why a payment failed, estimate the likelihood of recovery, or recommend the most appropriate intervention.

RecoverAI addresses this problem by using AI to analyze failed payments and guide a structured recovery process.

## Solution

RecoverAI follows this workflow:

**Detect → Analyze → Predict → Recommend → Approve → Recover → Verify**

When a payment fails, the agent analyzes the payment, estimates its recovery probability, recommends an action, requests human approval, and then executes a controlled recovery workflow through Razorpay.

## Key Features

### AI-Powered Payment Analysis
- Analyzes the reason behind failed payments
- Predicts the probability of successful recovery
- Provides a confidence score
- Recommends the next best recovery action

### Human-in-the-Loop Recovery
- Requires human approval before recovery execution
- Prevents unrestricted automated payment actions

### Razorpay Payment Recovery
- Creates a Razorpay recovery order
- Opens Razorpay Checkout in Test Mode
- Verifies the payment securely
- Updates the payment status after successful verification

### Safety Guardrails
- Maximum recovery amount limit
- Minimum AI confidence requirement
- Human approval requirement
- Payment signature verification

### Recovery Dashboard
- Displays failed payments
- Shows recovery probability
- Tracks recovery status
- Displays revenue recovered
- Maintains an activity log

## Tech Stack

### Frontend
- React
- Vite
- JavaScript
- CSS

### Backend
- Node.js
- Express.js

### AI
- OpenAI API

### Database
- MongoDB Atlas
- Mongoose

### Payment Integration
- Razorpay Test Mode
- Razorpay Checkout

### Development Tools
- Visual Studio Code
- Git
- GitHub

## Architecture

```text
User
 │
 ▼
React + Vite Dashboard
 │
 ▼
Node.js + Express Backend
 │
 ├──────────────► OpenAI API
 │                  │
 │                  ▼
 │             AI Analysis
 │
 ├──────────────► MongoDB Atlas
 │                  │
 │                  ▼
 │             Payment Data
 │
 ▼
Human Approval
 │
 ▼
Safety Guardrails
 │
 ▼
Razorpay Test Mode
 │
 ▼
Payment Verification
 │
 ▼
Recovered Payment

Recovery Workflow
Failed Payment
      ↓
AI Analysis
      ↓
Recovery Probability
      ↓
Recommended Action
      ↓
Human Approval
      ↓
Safety Guardrail Validation
      ↓
Razorpay Recovery Order
      ↓
Razorpay Checkout
      ↓
Payment Verification
      ↓
Payment Status: Recovered
      ↓
Activity Log Updated

## AI Decision Layer

RecoverAI uses AI to analyze failed payment information and generate a structured recovery recommendation.

The AI evaluates the payment context and provides:

- Failure analysis
- Recovery probability
- Recommended recovery action
- Urgency level
- Explanation
- Confidence score

The AI recommendation helps determine whether a recovery action should proceed, while final execution remains protected by human approval and safety guardrails.

## Safety Guardrails

RecoverAI uses bounded execution to prevent unsafe or unintended recovery actions.

| Guardrail | Purpose |
|---|---|
| Maximum recovery amount | Limits the payment amount eligible for recovery |
| Minimum AI confidence | Prevents low-confidence AI decisions from proceeding |
| Human approval | Requires explicit approval before recovery |
| Payment verification | Ensures the payment is verified before marking it as recovered |

## Project Structure

```text
AI-Revenue-Recovery/
│
├── frontend/
│   ├── src/
│   ├── public/
│   ├── index.html
│   └── package.json
│
├── backend/
│   ├── server.js
│   ├── package.json
│   └── .env
│
├── .gitignore
└── README.md

## Installation & Running

### 1. Clone the Repository

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd AI-Revenue-Recovery
2. Install Frontend Dependencies
cd frontend
npm install
3. Install Backend Dependencies

Open a new terminal:

cd backend
npm install
4. Configure Environment Variables

Create a .env file inside the backend folder:

OPENAI_API_KEY=your_openai_api_key
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
MONGODB_URI=your_mongodb_connection_string

Never commit the actual .env file or API keys to GitHub.

5. Start the Backend
cd backend
node server.js

Backend:

http://localhost:5000
6. Start the Frontend

In another terminal:

cd frontend
npm run dev

Frontend:

http://localhost:5173
7. Open RecoverAI

Open the frontend URL in your browser:

http://localhost:5173

## Demo Flow

The complete RecoverAI demonstration follows this workflow:

1. Select a failed payment from the dashboard.
2. Analyze the payment using AI.
3. View the failure analysis and recovery probability.
4. Review the recommended recovery action.
5. Approve the recovery as a human operator.
6. Validate the recovery against safety guardrails.
7. Create a Razorpay recovery order.
8. Complete the payment using Razorpay Test Mode.
9. Verify the Razorpay payment signature.
10. Update the payment status to `Recovered`.
11. Record the recovery event in the activity log.

### Example

**Failed Payment → AI Analysis → Human Approval → Razorpay Checkout → Payment Verification → Recovered**

## Future Scope

- Automated customer notification through email and SMS
- Intelligent retry scheduling
- Subscription payment recovery
- Checkout abandonment recovery
- Personalized recovery strategies
- Historical recovery outcome learning
- Revenue forecasting
- Multi-channel recovery workflows
- Production-ready authentication and authorization