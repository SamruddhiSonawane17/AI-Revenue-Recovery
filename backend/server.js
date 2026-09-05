const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const mongoose = require("mongoose");

dotenv.config();

const app = express();
const PORT = 5000;

// ==================================================
// MIDDLEWARE
// ==================================================

app.use(cors());
app.use(express.json());

// ==================================================
// ENVIRONMENT CHECK
// ==================================================

console.log("==============================================");
console.log("🔧 RecoverAI Environment Check");
console.log("==============================================");

console.log(
  "OpenAI Key:",
  process.env.OPENAI_API_KEY ? "✅ Loaded" : "❌ Missing"
);

console.log(
  "Razorpay Key ID:",
  process.env.RAZORPAY_KEY_ID ? "✅ Loaded" : "❌ Missing"
);

console.log(
  "Razorpay Secret:",
  process.env.RAZORPAY_KEY_SECRET ? "✅ Loaded" : "❌ Missing"
);

console.log(
  "MongoDB URI:",
  process.env.MONGODB_URI ? "✅ Loaded" : "❌ Missing"
);

console.log("==============================================");

// ==================================================
// OPENAI
// ==================================================

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 0,
});

// ==================================================
// RAZORPAY
// ==================================================

let razorpay = null;

if (
  process.env.RAZORPAY_KEY_ID &&
  process.env.RAZORPAY_KEY_SECRET
) {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

  console.log("💳 Razorpay SDK initialized successfully.");
} else {
  console.log("❌ Razorpay SDK could not initialize.");
}

// ==================================================
// MONGODB
// ==================================================

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("🍃 MongoDB connected successfully.");
  })
  .catch((error) => {
    console.error(
      "❌ MongoDB connection error:",
      error.message
    );
  });

// ==================================================
// PAYMENT SCHEMA
// ==================================================

const paymentSchema = new mongoose.Schema(
  {
    paymentId: {
      type: String,
      unique: true,
      required: true,
    },

    customer: {
      type: String,
      required: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    currency: {
      type: String,
      default: "INR",
    },

    method: {
      type: String,
      default: "Card",
    },

    failureReason: {
      type: String,
      required: true,
    },

    recoveryProbability: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: [
        "Failed",
        "Recovery Pending",
        "Recovered",
      ],
      default: "Failed",
    },

    aiAnalysis: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    approvalGranted: {
      type: Boolean,
      default: false,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    razorpayOrderId: {
      type: String,
      default: null,
    },

    razorpayPaymentId: {
      type: String,
      default: null,
    },

    recoveredAt: {
      type: Date,
      default: null,
    },

    activities: [
      {
        action: String,
        message: String,
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

const Payment = mongoose.model(
  "Payment",
  paymentSchema
);

// ==================================================
// ACTIVITY LOGGER
// ==================================================

async function addActivity(
  payment,
  action,
  message
) {
  payment.activities.push({
    action,
    message,
    timestamp: new Date(),
  });

  await payment.save();
}

// ==================================================
// DEMO PAYMENTS
// ==================================================

const demoPayments = [
  {
    paymentId: "pay_001",
    customer: "Aditya Sharma",
    amount: 12499,
    currency: "INR",
    method: "Card",
    failureReason: "Card Declined",
    recoveryProbability: 92,
    status: "Failed",
  },

  {
    paymentId: "pay_002",
    customer: "Priya Patil",
    amount: 7850,
    currency: "INR",
    method: "Card",
    failureReason: "Insufficient Funds",
    recoveryProbability: 74,
    status: "Failed",
  },

  {
    paymentId: "pay_003",
    customer: "Rahul Deshmukh",
    amount: 24999,
    currency: "INR",
    method: "Card",
    failureReason: "Network Error",
    recoveryProbability: 88,
    status: "Failed",
  },

  {
    paymentId: "pay_004",
    customer: "Neha Joshi",
    amount: 5499,
    currency: "INR",
    method: "Card",
    failureReason: "Authentication Failed",
    recoveryProbability: 63,
    status: "Failed",
  },
];

// ==================================================
// SEED DATABASE
// ==================================================

async function seedDatabase() {
  try {
    for (const demoPayment of demoPayments) {
      const existing = await Payment.findOne({
        paymentId: demoPayment.paymentId,
      });

      if (!existing) {
        await Payment.create({
          ...demoPayment,

          activities: [
            {
              action: "Payment Detected",

              message:
                `Failed payment detected for ${demoPayment.customer}.`,

              timestamp: new Date(),
            },
          ],
        });

        console.log(
          `🌱 Added demo payment: ${demoPayment.paymentId}`
        );
      }
    }

    console.log("🌱 Demo payment data ready.");
  } catch (error) {
    console.error(
      "❌ Seed error:",
      error.message
    );
  }
}

// ==================================================
// HOME
// ==================================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "RecoverAI Backend is running.",
  });
});

// ==================================================
// GET ALL PAYMENTS
// ==================================================

app.get(
  "/api/payments",
  async (req, res) => {
    try {
      const payments =
        await Payment.find().sort({
          createdAt: -1,
        });

      res.json(payments);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Unable to fetch payments.",
      });
    }
  }
);

// ==================================================
// GET FAILED PAYMENTS
// ==================================================

app.get(
  "/api/payments/failed",
  async (req, res) => {
    try {
      const payments =
        await Payment.find({
          status: {
            $in: [
              "Failed",
              "Recovery Pending",
            ],
          },
        }).sort({
          createdAt: -1,
        });

      res.json(payments);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message:
          "Unable to fetch failed payments.",
      });
    }
  }
);

// ==================================================
// DEMO AI ANALYSIS
// ==================================================

function demoAIAnalysis(payment) {
  const reason =
    payment.failureReason.toLowerCase();

  let recommendedAction =
    "Send retry link with alternative payment method";

  let urgency = "Medium";

  let explanation =
    "A retry using an alternative payment method may improve the chance of successful recovery.";

  if (reason.includes("declined")) {
    recommendedAction =
      "Send retry link with alternative payment method";

    urgency = "High";

    explanation =
      "The card transaction was declined. A retry with another payment method may recover the payment.";
  } else if (
    reason.includes("insufficient")
  ) {
    recommendedAction =
      "Send retry link with alternative payment method";

    urgency = "Medium";

    explanation =
      "The payment failed because of insufficient funds. The customer may still be recoverable based on the payment context.";
  } else if (
    reason.includes("network")
  ) {
    recommendedAction =
      "Retry payment automatically after a short delay";

    urgency = "High";

    explanation =
      "The failure appears temporary and network-related, making a controlled retry appropriate.";
  } else if (
    reason.includes("authentication")
  ) {
    recommendedAction =
      "Send secure retry link for authentication";

    urgency = "Medium";

    explanation =
      "The payment failed during authentication. A fresh authenticated retry may recover the transaction.";
  }

  return {
    failureAnalysis:
      `The payment failed because of ${payment.failureReason.toLowerCase()}. The customer may still be recoverable based on the payment context.`,

    recoveryProbability:
      payment.recoveryProbability,

    recommendedAction,

    urgency,

    explanation,

    confidence:
      payment.recoveryProbability,
  };
}

// ==================================================
// AI ANALYSIS
// ==================================================

app.post(
  "/api/ai/analyze",
  async (req, res) => {
    try {
      const { paymentId } =
        req.body;

      if (!paymentId) {
        return res.status(400).json({
          success: false,
          message:
            "Payment ID is required.",
        });
      }

      const payment =
        await Payment.findOne({
          paymentId,
        });

      if (!payment) {
        return res.status(404).json({
          success: false,
          message:
            "Payment not found.",
        });
      }

      let analysis;
      let aiMode = "OpenAI";

      const prompt = `
You are RecoverAI, an intelligent revenue recovery agent.

Analyze this failed payment:

Customer: ${payment.customer}
Amount: ₹${payment.amount}
Payment Method: ${payment.method}
Failure Reason: ${payment.failureReason}
Current Recovery Probability: ${payment.recoveryProbability}%

Return ONLY valid JSON.

{
  "failureAnalysis": "short explanation of why payment failed",
  "recoveryProbability": number between 0 and 100,
  "recommendedAction": "recommended recovery action",
  "urgency": "Low, Medium, or High",
  "explanation": "why this recovery action is suitable",
  "confidence": number between 0 and 100
}

Do not include markdown.
`;

      try {
        const response =
          await openai.responses.create({
            model:
              process.env.OPENAI_MODEL ||
              "gpt-5.6-sol",

            input: prompt,

            max_output_tokens: 500,
          });

        let output =
          response.output_text || "";

        output = output
          .replace(/```json/g, "")
          .replace(/```/g, "")
          .trim();

        analysis =
          JSON.parse(output);
      } catch (aiError) {
        console.log(
          "⚠️ OpenAI unavailable. Using Demo AI Mode:",
          aiError.message
        );

        analysis =
          demoAIAnalysis(payment);

        aiMode = "Demo AI Mode";
      }

      payment.aiAnalysis =
        analysis;

      payment.recoveryProbability =
        Number(
          analysis.recoveryProbability
        ) ||
        payment.recoveryProbability;

      await payment.save();

      await addActivity(
        payment,
        "AI Analysis",
        `AI analyzed ${payment.failureReason} and recommended: ${analysis.recommendedAction}.`
      );

      res.json({
        success: true,
        analysis,
        aiMode,
      });
    } catch (error) {
      console.error(
        "❌ AI analysis error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "AI analysis failed.",
      });
    }
  }
);

// ==================================================
// APPROVAL GUARDRAILS
// ==================================================

const MAX_RECOVERY_AMOUNT =
  50000;

const MIN_AI_CONFIDENCE =
  60;

// ==================================================
// APPROVE RECOVERY
// ==================================================

app.post(
  "/api/recovery/approve",
  async (req, res) => {
    try {
      const {
        paymentId,
        confidence,
      } = req.body;

      const payment =
        await Payment.findOne({
          paymentId,
        });

      if (!payment) {
        return res.status(404).json({
          success: false,
          message:
            "Payment not found.",
        });
      }

      const aiConfidence =
        Number(confidence) ||
        Number(
          payment.aiAnalysis?.confidence
        ) ||
        Number(
          payment.recoveryProbability
        );

      if (
        payment.amount >
        MAX_RECOVERY_AMOUNT
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Recovery amount exceeds the allowed safety limit.",
        });
      }

      if (
        aiConfidence <
        MIN_AI_CONFIDENCE
      ) {
        return res.status(403).json({
          success: false,
          message:
            "AI confidence is below the required approval threshold.",
        });
      }

      payment.approvalGranted =
        true;

      payment.approvedAt =
        new Date();

      payment.status =
        "Recovery Pending";

      await payment.save();

      await addActivity(
        payment,
        "Human Approval",
        "Human approval granted for recovery."
      );

      res.json({
        success: true,

        humanApproval: true,

        message:
          "Recovery approved successfully.",

        guardrails: {
          amountLimitPassed:
            true,

          confidenceLimitPassed:
            true,
        },

        aiDirectPaymentExecution:
          false,
      });
    } catch (error) {
      console.error(
        "❌ Approval error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to approve recovery.",
      });
    }
  }
);

// ==================================================
// CREATE RAZORPAY ORDER
// ==================================================

app.post(
  "/api/recovery/create-order",
  async (req, res) => {
    try {
      const { paymentId } =
        req.body;

      console.log(
        "📥 Create order request:",
        paymentId
      );

      if (!paymentId) {
        return res.status(400).json({
          success: false,
          message:
            "Payment ID is required.",
        });
      }

      const payment =
        await Payment.findOne({
          paymentId,
        });

      if (!payment) {
        return res.status(404).json({
          success: false,
          message:
            "Payment not found.",
        });
      }

      console.log(
        "💰 Payment found:",
        {
          paymentId:
            payment.paymentId,

          amount:
            payment.amount,

          currency:
            payment.currency,

          approvalGranted:
            payment.approvalGranted,

          status:
            payment.status,
        }
      );

      if (
        payment.status ===
        "Recovered"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "This payment is already recovered.",
        });
      }

      if (
        !payment.approvalGranted
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Human approval is required before starting recovery.",
        });
      }

      if (
        payment.amount >
        MAX_RECOVERY_AMOUNT
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Recovery amount exceeds the allowed limit.",
        });
      }

      // ------------------------------------------
      // RAZORPAY CONFIGURATION
      // ------------------------------------------

      const keyId =
        process.env.RAZORPAY_KEY_ID;

      const keySecret =
        process.env.RAZORPAY_KEY_SECRET;

      if (!keyId || !keySecret) {
        console.error(
          "❌ Razorpay credentials missing."
        );

        return res.status(500).json({
          success: false,
          message:
            "Razorpay credentials are missing on the backend.",
        });
      }

      // ------------------------------------------
      // CREATE RAZORPAY CLIENT
      // ------------------------------------------

      const razorpayClient =
        new Razorpay({
          key_id: keyId,
          key_secret: keySecret,
        });

      // ------------------------------------------
      // PREPARE ORDER DATA
      // ------------------------------------------

      const orderData = {
        amount: Math.round(
          Number(payment.amount) * 100
        ),

        currency:
          payment.currency || "INR",

        receipt:
          `recoverai_${payment.paymentId}_${Date.now()}`,

        notes: {
          paymentId:
            payment.paymentId,

          customer:
            payment.customer,

          recoveryAgent:
            "RecoverAI",

          environment:
            "Test Mode",
        },
      };

      console.log(
        "📤 Sending order to Razorpay:",
        {
          amount:
            orderData.amount,

          currency:
            orderData.currency,

          receipt:
            orderData.receipt,
        }
      );

      // ------------------------------------------
      // CREATE ORDER
      // ------------------------------------------

      const order =
        await razorpayClient.orders.create(
          orderData
        );

      console.log(
        "✅ Razorpay order created:",
        order.id
      );

      // ------------------------------------------
      // SAVE ORDER ID
      // ------------------------------------------

      payment.razorpayOrderId =
        order.id;

      payment.status =
        "Recovery Pending";

      await payment.save();

      // ------------------------------------------
      // ACTIVITY LOG
      // ------------------------------------------

      try {
        await addActivity(
          payment,
          "Razorpay Order Created",
          `Razorpay Test Mode order ${order.id} created for ${payment.customer}.`
        );
      } catch (activityError) {
        console.error(
          "⚠️ Activity logging failed:",
          activityError.message
        );
      }

      console.log(
        "=============================================="
      );

      console.log(
        "✅ RECOVERY ORDER READY"
      );

      console.log(
        "Order ID:",
        order.id
      );

      console.log(
        "Amount:",
        order.amount
      );

      console.log(
        "Currency:",
        order.currency
      );

      console.log(
        "Public Razorpay Key:",
        keyId
      );

      console.log(
        "=============================================="
      );

      // ------------------------------------------
      // SEND RESPONSE TO FRONTEND
      // ------------------------------------------

      return res.json({
        success: true,

        // PUBLIC KEY ONLY
        keyId: keyId,

        order: {
          id: order.id,

          amount:
            order.amount,

          currency:
            order.currency,

          receipt:
            order.receipt,

          status:
            order.status,
        },

        paymentId:
          payment.paymentId,
      });
    } catch (error) {
      console.error(
        "=============================================="
      );

      console.error(
        "❌ RAZORPAY ORDER CREATION FAILED"
      );

      console.error(
        "=============================================="
      );

      console.error(
        "Message:",
        error?.message
      );

      console.error(
        "Description:",
        error?.description
      );

      console.error(
        "Error:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          error?.error?.description ||
          error?.description ||
          error?.message ||
          "Unable to create Razorpay order.",
      });
    }
  }
);

// ==================================================
// VERIFY RAZORPAY PAYMENT
// ==================================================

app.post(
  "/api/recovery/verify-payment",
  async (req, res) => {
    try {
      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        paymentId,
      } = req.body;

      if (
        !razorpay_order_id ||
        !razorpay_payment_id ||
        !razorpay_signature ||
        !paymentId
      ) {
        return res.status(400).json({
          success: false,
          verified: false,
          message:
            "Missing Razorpay verification fields.",
        });
      }

      const payment =
        await Payment.findOne({
          paymentId,
        });

      if (!payment) {
        return res.status(404).json({
          success: false,
          verified: false,
          message:
            "Payment not found.",
        });
      }

      if (
        payment.razorpayOrderId !==
        razorpay_order_id
      ) {
        return res.status(400).json({
          success: false,
          verified: false,
          message:
            "Razorpay order does not match the recovery record.",
        });
      }

      if (
        !process.env
          .RAZORPAY_KEY_SECRET
      ) {
        return res.status(500).json({
          success: false,
          verified: false,
          message:
            "Razorpay Key Secret is missing.",
        });
      }

      // ------------------------------------------
      // CREATE EXPECTED SIGNATURE
      // ------------------------------------------

      const generatedSignature =
        crypto
          .createHmac(
            "sha256",
            process.env
              .RAZORPAY_KEY_SECRET
          )
          .update(
            `${razorpay_order_id}|${razorpay_payment_id}`
          )
          .digest("hex");

      const receivedBuffer =
        Buffer.from(
          razorpay_signature
        );

      const generatedBuffer =
        Buffer.from(
          generatedSignature
        );

      const signatureValid =
        receivedBuffer.length ===
          generatedBuffer.length &&
        crypto.timingSafeEqual(
          receivedBuffer,
          generatedBuffer
        );

      // ------------------------------------------
      // INVALID SIGNATURE
      // ------------------------------------------

      if (!signatureValid) {
        await addActivity(
          payment,
          "Payment Verification Failed",
          "Razorpay signature verification failed. Payment was not marked as recovered."
        );

        return res.status(400).json({
          success: false,
          verified: false,
          message:
            "Invalid Razorpay payment signature.",
        });
      }

      // ------------------------------------------
      // SUCCESSFUL RECOVERY
      // ------------------------------------------

      payment.status =
        "Recovered";

      payment.razorpayPaymentId =
        razorpay_payment_id;

      payment.razorpayOrderId =
        razorpay_order_id;

      payment.recoveredAt =
        new Date();

      await payment.save();

      await addActivity(
        payment,
        "Revenue Recovered",
        `₹${payment.amount.toLocaleString(
          "en-IN"
        )} successfully recovered through Razorpay Test Mode.`
      );

      console.log(
        `✅ Revenue recovered: ${payment.paymentId}`
      );

      res.json({
        success: true,

        verified: true,

        message:
          "Payment verified and revenue recovered.",

        payment,
      });
    } catch (error) {
      console.error(
        "❌ Payment verification error:",
        error
      );

      res.status(500).json({
        success: false,
        verified: false,
        message:
          "Payment verification failed.",
      });
    }
  }
);

// ==================================================
// DEMO RECOVERY
// ==================================================

app.post(
  "/api/recovery/retry",
  async (req, res) => {
    try {
      const { paymentId } =
        req.body;

      const payment =
        await Payment.findOne({
          paymentId,
        });

      if (!payment) {
        return res.status(404).json({
          success: false,
          message:
            "Payment not found.",
        });
      }

      payment.status =
        "Recovered";

      payment.recoveredAt =
        new Date();

      await payment.save();

      await addActivity(
        payment,
        "Demo Recovery",
        `Demo recovery completed for ₹${payment.amount.toLocaleString(
          "en-IN"
        )}.`
      );

      res.json({
        success: true,
        message:
          "Demo recovery completed.",
        payment,
      });
    } catch (error) {
      console.error(
        "❌ Demo recovery error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Demo recovery failed.",
      });
    }
  }
);

// ==================================================
// ACTIVITY LOG
// ==================================================

app.get(
  "/api/activity",
  async (req, res) => {
    try {
      const payments =
        await Payment.find();

      const activities = [];

      payments.forEach(
        (payment) => {
          payment.activities.forEach(
            (activity) => {
              activities.push({
                paymentId:
                  payment.paymentId,

                customer:
                  payment.customer,

                amount:
                  payment.amount,

                action:
                  activity.action,

                message:
                  activity.message,

                timestamp:
                  activity.timestamp,
              });
            }
          );
        }
      );

      activities.sort(
        (a, b) =>
          new Date(b.timestamp) -
          new Date(a.timestamp)
      );

      res.json(activities);
    } catch (error) {
      console.error(
        "❌ Activity error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to load activity log.",
      });
    }
  }
);

// ==================================================
// START SERVER
// ==================================================

async function startServer() {
  await new Promise(
    (resolve) =>
      setTimeout(resolve, 1000)
  );

  await seedDatabase();

  app.listen(PORT, () => {
    console.log(
      "=============================================="
    );

    console.log(
      "🚀 RecoverAI Backend"
    );

    console.log(
      "=============================================="
    );

    console.log(
      `🌐 Server: http://localhost:${PORT}`
    );

    console.log(
      "💳 Razorpay Test Mode integration ready."
    );

    console.log(
      "🔐 Razorpay signature verification enabled."
    );

    console.log(
      "🍃 MongoDB persistence enabled."
    );

    console.log(
      "🤖 AI Revenue Recovery Agent is ready."
    );

    console.log(
      "=============================================="
    );
  });
}

startServer();