document.addEventListener("DOMContentLoaded", () => {
  const askBtn = document.getElementById("askBtn");
  const pdfBtn = document.getElementById("pdfBtn");
  const pdfFileInput = document.getElementById("pdfFile");

  const questionInput = document.getElementById("question");
  const answerDiv = document.getElementById("answer");
  const actionSelect = document.getElementById("action");

  // ==============================
  // 🌐 WEB PAGE ASK
  // ==============================
  askBtn.addEventListener("click", async () => {
    answerDiv.innerHTML = "";

    let q = questionInput.value.trim().toLowerCase();
    const action = actionSelect.value;

    // Auto mode-la mattum question compulsory
    if (!q && action === "auto") {
      answerDiv.innerText = "Please enter a question";
      return;
    }

    // ----------------------------------
    // 🎟️ BOOKING LOGIC (UNCHANGED)
    // ----------------------------------
    if (q.includes("book") && q.includes("ticket")) {
      const ticket = detectTicketType(q);

      if (!ticket) {
        answerDiv.innerText =
          "Which ticket do you want to book?\n" +
          "Movie / Train / Bus / Flight / Event";
        return;
      }

      answerDiv.innerText =
        `I can help you book a ${ticket.name} ticket 👇\n\n` +
        "General steps:\n" +
        "1. Choose source / city\n" +
        "2. Select date & preferences\n" +
        "3. Pick available options\n" +
        "4. Enter details & pay\n\n" +
        "Click below to open booking page.";

      const btn = document.createElement("button");
      btn.innerText = `Open ${ticket.name} Booking Page`;
      btn.style.marginTop = "8px";
      btn.style.background = "#28a745";
      btn.style.color = "white";
      btn.style.border = "none";
      btn.style.padding = "7px";
      btn.style.width = "100%";
      btn.style.borderRadius = "4px";
      btn.style.cursor = "pointer";

      btn.onclick = () => chrome.tabs.create({ url: ticket.url });

      answerDiv.appendChild(document.createElement("br"));
      answerDiv.appendChild(btn);
      return;
    }

    // ----------------------------------
    // 🧠 SUMMARIZE / EXPLAIN (WEB)
    // ----------------------------------
    let prompt = q;
    if (action === "summarize") {
      prompt = "Summarize the following webpage content";
    } else if (action === "explain") {
      prompt = "Explain the following webpage content in simple terms";
    }

    answerDiv.innerText = "Thinking...";

    try {
      // Get current tab content
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });

      let pageText = "";

      try {
        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => document.body.innerText
        });
        pageText = result[0].result.slice(0, 3000); // speed limit
      } catch {
        pageText = "";
      }

      const res = await fetch("http://127.0.0.1:5000/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: prompt,
          page_content: pageText,
          action: action
        })
      });

      const data = await res.json();
      answerDiv.innerText = data.answer || "No response";

    } catch (err) {
      answerDiv.innerText = "Backend not reachable";
    }
  });

  // ==============================
  // 📄 PDF ANALYZE
  // ==============================
  pdfBtn.addEventListener("click", async () => {
    answerDiv.innerHTML = "";

    const file = pdfFileInput.files[0];
    const action = actionSelect.value;

    if (!file) {
      answerDiv.innerText = "Please upload a PDF file";
      return;
    }

    answerDiv.innerText = "Analyzing PDF...";

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("action", action);

      const res = await fetch("http://127.0.0.1:5000/ask_pdf", {
        method: "POST",
        body: formData
      });

      const data = await res.json();
      answerDiv.innerText = data.answer || "No response";

    } catch (err) {
      answerDiv.innerText = "Backend not reachable";
    }
  });

  // ----------------------------------
  // 🎯 Ticket Type Detector
  // ----------------------------------
  function detectTicketType(q) {
    if (q.includes("movie"))
      return { name: "Movie", url: "https://in.bookmyshow.com" };

    if (q.includes("train"))
      return { name: "Train", url: "https://www.irctc.co.in/nget/train-search" };

    if (q.includes("bus"))
      return { name: "Bus", url: "https://www.redbus.in" };

    if (q.includes("flight"))
      return { name: "Flight", url: "https://www.makemytrip.com/flights" };

    if (q.includes("event"))
      return { name: "Event", url: "https://in.bookmyshow.com/explore/events" };

    return null;
  }
});
