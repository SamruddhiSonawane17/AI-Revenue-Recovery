import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_URL = "http://localhost:5000";

function App() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedPayment, setSelectedPayment] = useState(null);
  const [aiResult, setAiResult] = useState(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);

  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [retryMessage, setRetryMessage] = useState("");

  const [activities, setActivities] = useState([]);

  // --------------------------------------------------
  // LOAD PAYMENTS
  // --------------------------------------------------
  const loadPayments = async () => {
    try {
      setLoading(true);

      const response = await fetch(`${API_URL}/api/payments`);

      if (!response.ok) {
        throw new Error("Failed to load payments");
      }

      const data = await response.json();

      setPayments(data);

      if (data.length > 0 && !selectedPayment) {
        setSelectedPayment(data[0]);
      }
    } catch (error) {
      console.error("Payment loading error:", error);
    } finally {
      setLoading(false);
    }
  };

  // --------------------------------------------------
  // LOAD ACTIVITY
  // --------------------------------------------------
  const loadActivities = async () => {
    try {
      const response = await fetch(`${API_URL}/api/activity`);

      if (!response.ok) {
        return;
      }

      const data = await response.json();
      setActivities(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Activity loading error:", error);
    }
  };

  useEffect(() => {
    loadPayments();
    loadActivities();
  }, []);

  // --------------------------------------------------
  // SELECT PAYMENT
  // --------------------------------------------------
  const selectPayment = (payment) => {
    setSelectedPayment(payment);
    setAiResult(payment.aiAnalysis || null);
    setRecoveryMessage("");
    setRetryMessage("");
  };

  // --------------------------------------------------
  // ADD LOCAL ACTIVITY
  // --------------------------------------------------
  const addActivity = (action, message) => {
    const newActivity = {
      action,
      message,
      timestamp: new Date().toISOString(),
    };

    setActivities((previous) => [newActivity, ...previous]);
  };

  // --------------------------------------------------
  // AI ANALYSIS
  // --------------------------------------------------
  const analyzePayment = async (payment) => {
    try {
      setSelectedPayment(payment);
      setAnalyzing(true);
      setAiResult(null);
      setRecoveryMessage("");
      setRetryMessage("");

      const response = await fetch(`${API_URL}/api/ai/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentId: payment.paymentId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "AI analysis failed");
      }

      setAiResult(data.analysis);

      addActivity(
        "AI Analysis",
        `AI analyzed payment ${payment.paymentId}`
      );

      await loadPayments();
      await loadActivities();
    } catch (error) {
      console.error("AI analysis error:", error);
      setRecoveryMessage(`❌ ${error.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  // --------------------------------------------------
  // HUMAN APPROVAL
  // --------------------------------------------------
  const approveRecovery = async () => {
    if (!selectedPayment) {
      return;
    }

    try {
      setApproving(true);
      setRecoveryMessage("");

      const confidence =
        Number(aiResult?.confidence) ||
        Number(selectedPayment?.aiAnalysis?.confidence) ||
        0;

      const response = await fetch(`${API_URL}/api/recovery/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentId: selectedPayment.paymentId,
          confidence,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || "Approval failed");
      }

      setRecoveryMessage(
        "✅ Recovery approved. You can now start the Razorpay recovery."
      );

      addActivity(
        "Human Approval",
        `Recovery approved for ${selectedPayment.paymentId}`
      );

      await loadPayments();
      await loadActivities();
    } catch (error) {
      console.error("Approval error:", error);
      setRecoveryMessage(`❌ ${error.message}`);
    } finally {
      setApproving(false);
    }
  };

  // --------------------------------------------------
  // MARK LOCAL PAYMENT AS RECOVERED
  // --------------------------------------------------
  const markPaymentRecovered = (paymentId) => {
    setPayments((previous) =>
      previous.map((payment) =>
        payment.paymentId === paymentId
          ? {
              ...payment,
              status: "Recovered",
            }
          : payment
      )
    );

    setSelectedPayment((previous) => {
      if (!previous || previous.paymentId !== paymentId) {
        return previous;
      }

      return {
        ...previous,
        status: "Recovered",
      };
    });
  };

  // --------------------------------------------------
  // RAZORPAY RECOVERY
  // --------------------------------------------------
  const startRazorpayRecovery = async () => {
    if (!selectedPayment) {
      return;
    }

    try {
      setCreatingOrder(true);
      setRecoveryMessage("");
      setRetryMessage("");

      const response = await fetch(
        `${API_URL}/api/recovery/create-order`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            paymentId: selectedPayment.paymentId,
          }),
        }
      );

      const data = await response.json();

      console.log("📦 Razorpay backend response:", data);

      if (!response.ok) {
        throw new Error(
          data.error ||
            data.message ||
            "Unable to create Razorpay order"
        );
      }

      // --------------------------------------------------
      // FIX:
      // Backend returns:
      // {
      //   success: true,
      //   order: {...},
      //   keyId: "rzp_test_..."
      // }
      //
      // Therefore read order fields from data.order
      // --------------------------------------------------

      const keyId = data.keyId;
      const order = data.order;

      console.log("🔑 Razorpay Key ID:", keyId);
      console.log("💳 Razorpay Order:", order);

      if (!keyId) {
        throw new Error(
          "Razorpay Key ID was not returned by the backend."
        );
      }

      if (!order?.id) {
        throw new Error(
          "Razorpay Order ID was not returned by the backend."
        );
      }

      if (!order?.amount) {
        throw new Error(
          "Razorpay Order amount was not returned by the backend."
        );
      }

      // --------------------------------------------------
      // MAKE SURE RAZORPAY CHECKOUT IS AVAILABLE
      // --------------------------------------------------
      if (!window.Razorpay) {
        throw new Error(
          "Razorpay Checkout SDK is not loaded. Please refresh the page."
        );
      }

      // --------------------------------------------------
      // RAZORPAY CHECKOUT OPTIONS
      // --------------------------------------------------
      const options = {
        key: keyId,

        amount: order.amount,

        currency: order.currency || "INR",

        name: "RecoverAI",

        description: "Revenue Recovery Payment",

        order_id: order.id,

        prefill: {
          name: selectedPayment.customer,
        },

        notes: {
          paymentId: selectedPayment.paymentId,
          recoveryAgent: "RecoverAI",
        },

        theme: {
          color: "#635bff",
        },

        handler: async function (paymentResponse) {
          try {
            setRecoveryMessage(
              "🔐 Verifying Razorpay payment..."
            );

            console.log(
              "💰 Razorpay payment response:",
              paymentResponse
            );

            const verifyResponse = await fetch(
              `${API_URL}/api/recovery/verify-payment`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  razorpay_order_id:
                    paymentResponse.razorpay_order_id,

                  razorpay_payment_id:
                    paymentResponse.razorpay_payment_id,

                  razorpay_signature:
                    paymentResponse.razorpay_signature,

                  paymentId: selectedPayment.paymentId,
                }),
              }
            );

            const verifyData = await verifyResponse.json();

            console.log(
              "🔐 Razorpay verification response:",
              verifyData
            );

            if (
              !verifyResponse.ok ||
              !verifyData.verified
            ) {
              throw new Error(
                verifyData.error ||
                  verifyData.message ||
                  "Razorpay payment verification failed"
              );
            }

            markPaymentRecovered(
              selectedPayment.paymentId
            );

            setRecoveryMessage(
              "🎉 Payment successfully recovered and verified!"
            );

            addActivity(
              "Revenue Recovered",
              `₹${Number(
                selectedPayment.amount
              ).toLocaleString(
                "en-IN"
              )} recovered from ${
                selectedPayment.customer
              }`
            );

            await loadPayments();
            await loadActivities();
          } catch (error) {
            console.error(
              "Payment verification error:",
              error
            );

            setRecoveryMessage(
              `❌ ${error.message}`
            );
          }
        },

        modal: {
          ondismiss: function () {
            setRecoveryMessage(
              "Payment checkout was closed."
            );
          },
        },
      };

      console.log(
        "🚀 Opening Razorpay Checkout..."
      );

      const razorpay =
        new window.Razorpay(options);

      razorpay.on(
        "payment.failed",
        function (response) {
          console.error(
            "Razorpay payment failed:",
            response.error
          );

          setRecoveryMessage(
            `❌ Payment failed: ${
              response.error?.description ||
              "Transaction failed"
            }`
          );
        }
      );

      razorpay.open();

      addActivity(
        "Razorpay Checkout",
        `Razorpay recovery checkout opened for ${selectedPayment.paymentId}`
      );
    } catch (error) {
      console.error(
        "Razorpay recovery error:",
        error
      );

      setRecoveryMessage(
        `❌ ${error.message}`
      );
    } finally {
      setCreatingOrder(false);
    }
  };

  // --------------------------------------------------
  // DEMO RECOVERY FALLBACK
  // --------------------------------------------------
  const retryPayment = async () => {
    if (!selectedPayment) {
      return;
    }

    try {
      setRetryMessage("");

      const response = await fetch(
        `${API_URL}/api/recovery/retry`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            paymentId: selectedPayment.paymentId,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            data.message ||
            "Recovery failed"
        );
      }

      setRetryMessage(
        "🎉 Demo recovery completed successfully!"
      );

      markPaymentRecovered(
        selectedPayment.paymentId
      );

      addActivity(
        "Demo Recovery",
        `Demo recovery completed for ${selectedPayment.paymentId}`
      );

      await loadPayments();
      await loadActivities();
    } catch (error) {
      console.error(
        "Retry error:",
        error
      );

      setRetryMessage(
        `❌ ${error.message}`
      );
    }
  };

  // --------------------------------------------------
  // ANALYTICS
  // --------------------------------------------------
  const analytics = useMemo(() => {
    const failedPayments = payments.filter(
      (payment) =>
        payment.status === "Failed"
    );

    const recoveryPendingPayments =
      payments.filter(
        (payment) =>
          payment.status ===
          "Recovery Pending"
      );

    const recoveredPayments =
      payments.filter(
        (payment) =>
          payment.status === "Recovered"
      );

    const failedRevenue =
      failedPayments.reduce(
        (total, payment) =>
          total +
          Number(payment.amount || 0),
        0
      );

    const pendingRevenue =
      recoveryPendingPayments.reduce(
        (total, payment) =>
          total +
          Number(payment.amount || 0),
        0
      );

    const recoveredRevenue =
      recoveredPayments.reduce(
        (total, payment) =>
          total +
          Number(payment.amount || 0),
        0
      );

    const totalRevenue =
      failedRevenue +
      pendingRevenue +
      recoveredRevenue;

    const recoveryRate =
      payments.length > 0
        ? Math.round(
            (recoveredPayments.length /
              payments.length) *
              100
          )
        : 0;

    return {
      failedPayments,
      failedRevenue,
      pendingRevenue,
      recoveredRevenue,
      recoveryRate,
      totalRevenue,
    };
  }, [payments]);

  // --------------------------------------------------
  // RENDER
  // --------------------------------------------------
  return (
    <div className="app">

      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">
            R
          </div>

          <h1>RecoverAI</h1>

          <p>
            Revenue Intelligence
          </p>
        </div>

        <nav className="sidebar-nav">
          <button className="nav-item active">
            📊 <span>Dashboard</span>
          </button>

          <button className="nav-item">
            💳 <span>Failed Payments</span>
          </button>

          <button className="nav-item">
            🤖 <span>AI Recovery</span>
          </button>

          <button className="nav-item">
            📈 <span>Analytics</span>
          </button>

          <button className="nav-item">
            📝 <span>Activity Log</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <strong>
            Razorpay Test Mode
          </strong>

          <span>
            🛡️ AI Guardrails Active
          </span>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="main-content">
        <header className="page-header">
          <h2>
            Revenue Recovery Dashboard
          </h2>

          <p>
            AI-powered detection and recovery
            of failed payments
          </p>
        </header>

        {/* STATS */}
        <section className="stats-grid">

          <div className="stat-card">
            <div className="stat-icon">
              ⚠️
            </div>

            <div>
              <span>
                Failed Revenue
              </span>

              <h3>
                ₹
                {analytics.failedRevenue.toLocaleString(
                  "en-IN"
                )}
              </h3>

              <p>
                Revenue currently at risk
              </p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              💰
            </div>

            <div>
              <span>
                Revenue at Risk
              </span>

              <h3>
                ₹
                {(
                  analytics.failedRevenue +
                  analytics.pendingRevenue
                ).toLocaleString(
                  "en-IN"
                )}
              </h3>

              <p>
                Needs recovery action
              </p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              ✓
            </div>

            <div>
              <span>
                Recovered Revenue
              </span>

              <h3>
                ₹
                {analytics.recoveredRevenue.toLocaleString(
                  "en-IN"
                )}
              </h3>

              <p>
                Successfully recovered
              </p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              📈
            </div>

            <div>
              <span>
                Recovery Rate
              </span>

              <h3>
                {analytics.recoveryRate}%
              </h3>

              <p>
                Overall recovery
              </p>
            </div>
          </div>

        </section>

        {/* MAIN GRID */}
        <section className="dashboard-grid">

          {/* FAILED PAYMENTS */}
          <div className="panel failed-payments-panel">

            <div className="panel-header">

              <div>
                <h2>
                  Recent Failed Payments
                </h2>

                <p>
                  Payments detected by RecoverAI
                </p>
              </div>

              <span className="payment-count">
                {analytics.failedPayments.length}
              </span>

            </div>

            {loading ? (
              <div className="empty-state">
                Loading payments...
              </div>
            ) : payments.length === 0 ? (
              <div className="empty-state">
                No payments found.
              </div>
            ) : (
              <div className="payments-list">

                {payments.map((payment) => (

                  <div
                    className={`payment-row ${
                      selectedPayment?.paymentId ===
                      payment.paymentId
                        ? "selected"
                        : ""
                    }`}
                    key={payment.paymentId}
                    onClick={() =>
                      selectPayment(payment)
                    }
                  >

                    <div className="customer-avatar">
                      {payment.customer
                        ?.charAt(0)
                        ?.toUpperCase() ||
                        "P"}
                    </div>

                    <div className="payment-customer">

                      <strong>
                        {payment.customer}
                      </strong>

                      <span>
                        {payment.paymentId}
                      </span>

                    </div>

                    <div className="payment-amount">

                      ₹
                      {Number(
                        payment.amount
                      ).toLocaleString(
                        "en-IN"
                      )}

                    </div>

                    <div
                      className={`payment-status ${
                        payment.status ===
                        "Recovered"
                          ? "recovered"
                          : payment.status ===
                            "Recovery Pending"
                          ? "pending"
                          : "failed"
                      }`}
                    >
                      {payment.status}
                    </div>

                    <button
                      className="analyze-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        analyzePayment(
                          payment
                        );
                      }}
                    >
                      Analyze
                    </button>

                  </div>

                ))}

              </div>
            )}

          </div>

          {/* AI RECOVERY AGENT */}
          <div className="panel ai-panel">

            <div className="panel-header">

              <div>
                <h2>
                  🤖 AI Recovery Agent
                </h2>

                <p>
                  Intelligent failure analysis
                  and recovery
                </p>
              </div>

              <span className="ai-live">
                ● AI LIVE
              </span>

            </div>

            {!selectedPayment ? (
              <div className="empty-state">
                Select a payment to start AI
                analysis.
              </div>
            ) : (
              <>

                {/* SELECTED PAYMENT */}
                <div className="selected-payment">

                  <div>
                    <small>
                      Selected Payment
                    </small>

                    <strong>
                      {selectedPayment.customer}
                    </strong>

                    <span>
                      {selectedPayment.paymentId}
                    </span>
                  </div>

                  <div className="selected-amount">

                    ₹
                    {Number(
                      selectedPayment.amount
                    ).toLocaleString(
                      "en-IN"
                    )}

                  </div>

                </div>

                {/* PROBABILITY */}
                <div className="probability-section">

                  <div className="probability-header">

                    <span>
                      Recovery Probability
                    </span>

                    <strong>
                      {aiResult?.recoveryProbability ??
                        selectedPayment
                          ?.recoveryProbability ??
                        0}
                      %
                    </strong>

                  </div>

                  <div className="progress-bar">

                    <div
                      className="progress-fill"
                      style={{
                        width: `${
                          aiResult?.recoveryProbability ??
                          selectedPayment
                            ?.recoveryProbability ??
                          0
                        }%`,
                      }}
                    />

                  </div>

                </div>

                {/* AI ANALYSIS */}
                {analyzing ? (

                  <div className="ai-loading">
                    🤖 AI is analyzing the
                    payment...
                  </div>

                ) : aiResult ? (

                  <div className="ai-analysis">

                    <h3>
                      🔍 AI Failure Analysis
                    </h3>

                    <p className="analysis-status">
                      AI analysis completed.
                    </p>

                    <div className="analysis-card">

                      <div>

                        <span>
                          Failure Analysis
                        </span>

                        <strong>
                          {aiResult.failureAnalysis ||
                            selectedPayment.failureReason ||
                            "Payment failure detected"}
                        </strong>

                      </div>

                      <div>

                        <span>
                          💡 Recommended Action
                        </span>

                        <strong>
                          {aiResult.recommendedAction ||
                            "Retry payment"}
                        </strong>

                      </div>

                      <div>

                        <span>
                          ⚡ Urgency
                        </span>

                        <strong>
                          {aiResult.urgency ||
                            "Medium"}
                        </strong>

                      </div>

                      <div>

                        <span>
                          Confidence
                        </span>

                        <strong>
                          {aiResult.confidence ??
                            0}
                          %
                        </strong>

                      </div>

                      <div className="explanation">

                        <span>
                          Explanation
                        </span>

                        <p>
                          {aiResult.explanation ||
                            "AI generated recovery recommendation."}
                        </p>

                      </div>

                    </div>

                  </div>

                ) : (

                  <div className="ai-empty">

                    <h3>
                      🔍 AI Failure Analysis
                    </h3>

                    <p>
                      Click Analyze to let
                      RecoverAI determine the
                      best recovery action.
                    </p>

                  </div>

                )}

                {/* APPROVAL */}
                <div className="approval-section">

                  <h3>
                    Human Approval Required
                  </h3>

                  <p>
                    RecoverAI will not directly
                    execute high-impact recovery
                    actions without approval.
                  </p>

                  <button
                    className="approve-btn"
                    disabled={
                      approving ||
                      !aiResult ||
                      selectedPayment.status ===
                        "Recovered"
                    }
                    onClick={
                      approveRecovery
                    }
                  >
                    {approving
                      ? "Approving..."
                      : selectedPayment.approvalGranted
                      ? "✓ Recovery Approved"
                      : "✓ Approve Recovery"}
                  </button>

                  {recoveryMessage && (
                    <div className="recovery-message">
                      {recoveryMessage}
                    </div>
                  )}

                </div>

                {/* RAZORPAY */}
                <div className="razorpay-section">

                  <h3>
                    💳 Razorpay Test Mode
                  </h3>

                  <p>
                    Securely retry this payment
                    using Razorpay Test Mode.
                  </p>

                  <button
                    className="razorpay-btn"
                    disabled={
                      creatingOrder ||
                      !selectedPayment.approvalGranted ||
                      selectedPayment.status ===
                        "Recovered"
                    }
                    onClick={
                      startRazorpayRecovery
                    }
                  >
                    {creatingOrder
                      ? "Creating Payment..."
                      : selectedPayment.status ===
                        "Recovered"
                      ? "✓ Payment Recovered"
                      : "Retry with Razorpay"}
                  </button>

                  {!selectedPayment.approvalGranted &&
                    selectedPayment.status !==
                      "Recovered" && (
                      <small>
                        Approve the recovery
                        before starting the
                        payment.
                      </small>
                    )}

                </div>

                {/* DEMO RECOVERY */}
                <div className="demo-section">

                  <button
                    className="demo-btn"
                    disabled={
                      selectedPayment.status ===
                      "Recovered"
                    }
                    onClick={retryPayment}
                  >
                    Demo Recovery
                  </button>

                  {retryMessage && (
                    <p className="retry-message">
                      {retryMessage}
                    </p>
                  )}

                </div>

              </>
            )}

          </div>

        </section>

        {/* RECOVERY PERFORMANCE */}
        <section className="panel performance-panel">

          <div className="panel-header">

            <div>

              <h2>
                📈 Recovery Performance
              </h2>

              <p>
                Current revenue recovery
                performance
              </p>

            </div>

          </div>

          <div className="performance-grid">

            <div className="performance-item">

              <span>
                Total Payments
              </span>

              <strong>
                {payments.length}
              </strong>

            </div>

            <div className="performance-item">

              <span>
                Failed
              </span>

              <strong>
                {analytics.failedPayments.length}
              </strong>

            </div>

            <div className="performance-item">

              <span>
                Recovered
              </span>

              <strong>
                {
                  payments.filter(
                    (payment) =>
                      payment.status ===
                      "Recovered"
                  ).length
                }
              </strong>

            </div>

            <div className="performance-item">

              <span>
                Recovery Rate
              </span>

              <strong>
                {analytics.recoveryRate}%
              </strong>

            </div>

          </div>

        </section>

        {/* SAFETY */}
        <section className="panel safety-panel">

          <div className="panel-header">

            <div>

              <h2>
                🛡️ AI Safety & Guardrails
              </h2>

              <p>
                RecoverAI operates within
                bounded recovery controls
              </p>

            </div>

          </div>

          <div className="guardrails-grid">

            <div className="guardrail">

              <span>✓</span>

              <div>

                <strong>
                  Human Approval
                </strong>

                <p>
                  Required before recovery
                  execution
                </p>

              </div>

            </div>

            <div className="guardrail">

              <span>✓</span>

              <div>

                <strong>
                  Amount Limit
                </strong>

                <p>
                  Recovery actions are bounded
                </p>

              </div>

            </div>

            <div className="guardrail">

              <span>✓</span>

              <div>

                <strong>
                  AI Confidence
                </strong>

                <p>
                  Low-confidence actions are
                  blocked
                </p>

              </div>

            </div>

            <div className="guardrail">

              <span>✓</span>

              <div>

                <strong>
                  Signature Verification
                </strong>

                <p>
                  Razorpay payment verified
                  securely
                </p>

              </div>

            </div>

            <div className="guardrail">

              <span>✓</span>

              <div>

                <strong>
                  No Direct AI Payment
                </strong>

                <p>
                  AI cannot independently
                  execute payments
                </p>

              </div>

            </div>

          </div>

        </section>

        {/* ACTIVITY LOG */}
        <section className="panel activity-panel">

          <div className="panel-header">

            <div>

              <h2>
                📝 AI Activity Log
              </h2>

              <p>
                RecoverAI decision and recovery
                activity
              </p>

            </div>

          </div>

          {activities.length === 0 ? (

            <div className="empty-state">
              No activity yet.
            </div>

          ) : (

            <div className="activity-list">

              {activities
                .slice(0, 10)
                .map(
                  (activity, index) => (

                    <div
                      className="activity-item"
                      key={`${
                        activity.timestamp ||
                        "activity"
                      }-${
                        activity.action ||
                        "action"
                      }-${index}`}
                    >

                      <div className="activity-dot">
                        ✓
                      </div>

                      <div className="activity-content">

                        <strong>
                          {activity.action ||
                            "Activity"}
                        </strong>

                        <p>
                          {activity.message ||
                            "RecoverAI activity recorded"}
                        </p>

                        <small>
                          {activity.timestamp
                            ? new Date(
                                activity.timestamp
                              ).toLocaleString(
                                "en-IN"
                              )
                            : ""}
                        </small>

                      </div>

                    </div>

                  )
                )}

            </div>

          )}

        </section>

        {/* FOOTER */}
        <footer className="footer">

          <strong>
            RecoverAI
          </strong>

          <span>
            Intelligent Revenue Recovery Agent
          </span>

          <span>
            Razorpay AI Buildathon 2026
          </span>

        </footer>

      </main>
    </div>
  );
}

export default App;