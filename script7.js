
      async function callGemini(prompt, outputElementId, buttonId) {
        const outputEl = document.getElementById(outputElementId);
        const btnEl = document.getElementById(buttonId);

        if (!outputEl || !btnEl) return;

        const apiKey = localStorage.getItem("qe_gemini_api_key") || window.ENV_GEMINI_API_KEY;
        if (!apiKey) {
          outputEl.innerHTML = `<span style="color: var(--warning)">API Key Missing. Please configure it in Settings.</span>`;
          return;
        }

        const originalBtnText = btnEl.innerHTML;
        btnEl.innerHTML =
          '<i data-lucide="loader-2" class="spin"></i> Analyzing...';
        btnEl.disabled = true;
        outputEl.innerHTML = "Analyzing your data...";
        lucide.createIcons();

        try {
          const { GoogleGenAI } = await import("https://esm.run/@google/genai");
          const ai = new GoogleGenAI({ apiKey: apiKey });
          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: {
              systemInstruction:
                "You are an expert quantitative trading analyst and risk manager. Provide concise, actionable, and data-driven insights. Format your response using HTML (e.g., <strong>, <ul>, <li>) for readability, but do not wrap it in a markdown code block. Keep it brief and highly relevant to the provided data.",
            },
          });
          outputEl.innerHTML = response.text;
        } catch (error) {
          console.error("AI Analysis Error:", error);
          outputEl.innerHTML = `<span style="color: var(--danger)">Failed to generate insight: ${error.message}</span>`;
        } finally {
          btnEl.innerHTML = originalBtnText;
          btnEl.disabled = false;
          lucide.createIcons();
        }
      }

      window.parsePair = function (pair) {
        if (!pair) return { base: "?", quote: "?" };
        pair = pair.toUpperCase().replace(/[^A-Z0-9]/g, "");

        // Forex pairs (6 chars)
        if (pair.length === 6) {
          return { base: pair.substring(0, 3), quote: pair.substring(3, 6) };
        }

        // Indices & Commodities
        if (pair.endsWith("USD")) {
          return { base: pair.replace("USD", ""), quote: "USD" };
        }
        if (pair.startsWith("USD")) {
          return { base: "USD", quote: pair.replace("USD", "") };
        }

        // Special cases for indices
        const indices = [
          "NAS100",
          "US30",
          "SPX500",
          "GER30",
          "UK100",
          "DAX",
          "FTSE",
          "DXY",
          "BTC",
          "ETH",
        ];
        if (indices.some((idx) => pair.includes(idx))) {
          return { base: pair, quote: "USD" };
        }

        // Generic fallback
        return { base: pair, quote: "USD" };
      };

      window.addActiveTrade = function (type) {
        const pair = document.getElementById(`${type}-pair`).value;
        const size = parseFloat(document.getElementById(`${type}-size`).value);
        const side = document.getElementById(`${type}-side`).value;

        if (!pair || isNaN(size)) return;

        const trade = { id: Date.now(), pair, size, side };
        if (type === "active") {
          if (!Store.activeTrades) Store.activeTrades = [];
          Store.activeTrades.push(trade);
        } else {
          if (!Store.plannedTrades) Store.plannedTrades = [];
          Store.plannedTrades.push(trade);
        }
        Store.save();
        updateExposureAnalysis();

        // Clear inputs
        document.getElementById(`${type}-pair`).value = "";
        document.getElementById(`${type}-size`).value = "";
      };

      window.removeActiveTrade = function (type, id) {
        if (type === "active") {
          Store.activeTrades = Store.activeTrades.filter((t) => t.id !== id);
        } else {
          Store.plannedTrades = Store.plannedTrades.filter((t) => t.id !== id);
        }
        Store.save();
        updateExposureAnalysis();
      };

      window.updateExposureAnalysis = function () {
        const exposures = {};
        const trades = [
          ...(Store.activeTrades || []),
          ...(Store.plannedTrades || []),
        ];

        trades.forEach((t) => {
          const { base, quote } = parsePair(t.pair);
          const multiplier = t.side === "BUY" ? 1 : -1;

          exposures[base] = (exposures[base] || 0) + t.size * multiplier;
          exposures[quote] = (exposures[quote] || 0) - t.size * multiplier;
        });

        renderExposureUI(exposures);
      };

      let exposureChart = null;
      window.renderExposureUI = function (exposures) {
        const tableBody = document.getElementById("exposure-table-body");
        const warningsEl = document.getElementById("exposure-warnings");
        const activeList = document.getElementById("active-trades-list");
        const plannedList = document.getElementById("planned-trades-list");
        const statusBadge = document.getElementById("exposure-status-badge");

        if (!tableBody) return;

        // Render Active Trades
        activeList.innerHTML = (Store.activeTrades || [])
          .map(
            (t) => `
                <div class="heatmap-cell" style="flex-direction: row; justify-content: space-between; width: 100%; padding: 8px 12px;">
                    <span style="font-weight:700;">${t.pair}</span>
                    <span style="color: ${t.side === "BUY" ? "var(--success)" : "var(--danger)"}; font-weight:700;">${t.side} ${t.size}</span>
                    <button class="secondary" style="padding: 4px 8px; font-size: 0.7rem;" onclick="removeActiveTrade('active', ${t.id})">Remove</button>
                </div>
            `,
          )
          .join("");

        // Render Planned Trades
        plannedList.innerHTML = (Store.plannedTrades || [])
          .map(
            (t) => `
                <div class="heatmap-cell" style="flex-direction: row; justify-content: space-between; width: 100%; padding: 8px 12px; border-style: dashed;">
                    <span style="font-weight:700;">${t.pair}</span>
                    <span style="color: ${t.side === "BUY" ? "var(--success)" : "var(--danger)"}; font-weight:700;">${t.side} ${t.size}</span>
                    <button class="secondary" style="padding: 4px 8px; font-size: 0.7rem;" onclick="removeActiveTrade('planned', ${t.id})">Remove</button>
                </div>
            `,
          )
          .join("");

        // Unique pairs from journal for dropdown
        const journalPairs = [
          ...new Set(Store.trades.map((t) => t.asset)),
        ].sort();
        const pairOptions = journalPairs
          .map((p) => `<option value="${p}">${p}</option>`)
          .join("");
        document.getElementById("active-pair-list").innerHTML = pairOptions;
        document.getElementById("planned-pair-list").innerHTML = pairOptions;

        // Exposure Table
        const currencies = Object.keys(exposures).filter(
          (c) => Math.abs(exposures[c]) > 0.0001,
        );
        const totalAbsExposure = Object.values(exposures).reduce(
          (sum, val) => sum + Math.abs(val),
          0,
        );

        tableBody.innerHTML = currencies
          .map((c) => {
            const val = exposures[c];
            const pct =
              totalAbsExposure > 0
                ? (Math.abs(val) / totalAbsExposure) * 100
                : 0;
            return `
                    <tr>
                        <td style="font-weight:700;">${c}</td>
                        <td style="color: ${val >= 0 ? "var(--success)" : "var(--danger)"}; font-family: var(--font-mono); font-weight:700;">
                            ${val >= 0 ? "+" : ""}${val.toFixed(2)}
                        </td>
                        <td>
                            <div class="progress-container" style="width: 60px; display: inline-block; margin-right: 8px; vertical-align: middle;">
                                <div class="progress-bar" style="width: ${pct}%; background: ${pct > 70 ? "var(--danger)" : pct > 50 ? "var(--warning)" : "var(--primary)"};"></div>
                            </div>
                            ${pct.toFixed(1)}%
                        </td>
                    </tr>
                `;
          })
          .join("");

        // Warnings & Correlations
        let warnings = [];
        let maxPct = 0;
        currencies.forEach((c) => {
          const pct =
            totalAbsExposure > 0
              ? (Math.abs(exposures[c]) / totalAbsExposure) * 100
              : 0;
          maxPct = Math.max(maxPct, pct);
          if (pct > 70)
            warnings.push(
              `<div style="color: var(--danger); margin-bottom: 8px;"><i data-lucide="alert-triangle" style="width:16px;height:16px;display:inline;margin-right:4px;"></i> <strong>CRITICAL:</strong> ${c} exposure is ${pct.toFixed(1)}%. High risk of liquidation on ${c} volatility.</div>`,
            );
          else if (pct > 50)
            warnings.push(
              `<div style="color: var(--warning); margin-bottom: 8px;"><i data-lucide="alert-circle" style="width:16px;height:16px;display:inline;margin-right:4px;"></i> <strong>WARNING:</strong> ${c} exposure is ${pct.toFixed(1)}%. High concentration detected.</div>`,
            );
        });

        // Update Status Badge
        if (statusBadge) {
          if (maxPct > 70) {
            statusBadge.innerText = "Critical";
            statusBadge.className = "risk-badge risk-high";
          } else if (maxPct > 50) {
            statusBadge.innerText = "High Exposure";
            statusBadge.className = "risk-badge risk-med";
          } else {
            statusBadge.innerText = "Balanced";
            statusBadge.className = "risk-badge risk-low";
          }
        }

        // Correlation detection
        const usdExposure = exposures["USD"] || 0;
        const trades = [
          ...(Store.activeTrades || []),
          ...(Store.plannedTrades || []),
        ];
        const usdDependent = trades.filter((t) => {
          const { base, quote } = parsePair(t.pair);
          return base === "USD" || quote === "USD";
        });
        if (
          usdDependent.length >= 2 &&
          Math.abs(usdExposure) > totalAbsExposure * 0.4
        ) {
          warnings.push(
            `<div style="color: var(--warning); margin-bottom: 8px;"><i data-lucide="layers" style="width:16px;height:16px;display:inline;margin-right:4px;"></i> <strong>Correlated Exposure:</strong> Multiple USD-dependent positions detected (${usdDependent.map((t) => t.pair).join(", ")}).</div>`,
          );
        }

        warningsEl.innerHTML =
          warnings.length > 0
            ? warnings.join("")
            : `<div style="color: var(--success);"><i data-lucide="check-circle" style="width:16px;height:16px;display:inline;margin-right:4px;"></i> Exposure levels are balanced. No hidden correlations detected.</div>`;
        lucide.createIcons({ root: warningsEl });

        // Chart
        const ctx = document.getElementById("exposureChart");
        if (ctx) {
          const labels = Object.keys(exposures).filter(
            (c) => Math.abs(exposures[c]) > 0.0001,
          );
          const data = labels.map((c) => exposures[c]);

          if (exposureChart) exposureChart.destroy();

          exposureChart = new Chart(ctx, {
            type: "bar",
            data: {
              labels: labels,
              datasets: [
                {
                  label: "Net Exposure",
                  data: data,
                  backgroundColor: data.map((v) =>
                    v >= 0
                      ? "rgba(16, 185, 129, 0.5)"
                      : "rgba(244, 63, 94, 0.5)",
                  ),
                  borderColor: data.map((v) =>
                    v >= 0 ? "#10b981" : "#f43f5e",
                  ),
                  borderWidth: 1,
                },
              ],
            },
            options: {
              indexAxis: "y",
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: {
                  grid: { color: "rgba(255,255,255,0.05)" },
                  ticks: { color: "#71717a" },
                },
                y: { grid: { display: false }, ticks: { color: "#71717a" } },
              },
            },
          });
        }
      };

      window.analyzeCorrelation = function () {
        updateExposureAnalysis();
      };

      window.checkDrawdownAlerts = function () {
        let alerts = [];
        Store.accounts.forEach((a) => {
          if (a.type !== "Prop") return;
          const dailyLimit = a.dailyDD || 5;
          const totalLimit = a.maxDD || 10;
          const currentDD = a.currentDD || 0;

          if (dailyLimit - currentDD <= 1.5 && currentDD < dailyLimit) {
            alerts.push(`${a.name} is within 1.5% of Daily Drawdown limit!`);
          }
          if (totalLimit - currentDD <= 2.0 && currentDD < totalLimit) {
            alerts.push(`${a.name} is within 2.0% of Total Drawdown limit!`);
          }
        });
        alerts.forEach((msg) => {
          showToast(msg, "danger");
          if (Notification.permission === "granted") {
            new Notification("QuantEdge Alert", { body: msg });
          }
        });
      };

      window.showToast = function (message, type = "info") {
        const container = document.getElementById("toast-container");
        const toast = document.createElement("div");
        const colors = {
          info: "var(--primary)",
          warning: "var(--warning)",
          danger: "var(--danger)",
          success: "var(--success)",
        };
        toast.style.cssText = `background: var(--surface); border-left: 4px solid ${colors[type]}; padding: 16px; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); color: var(--text); font-size: 0.9rem; animation: slideIn 0.3s ease-out; display: flex; align-items: center; gap: 12px;`;
        toast.innerHTML = `<i data-lucide="alert-circle" style="color: ${colors[type]}"></i> <span>${message}</span>`;
        container.appendChild(toast);
        lucide.createIcons({ root: toast });
        setTimeout(() => {
          toast.style.opacity = "0";
          toast.style.transition = "opacity 0.3s ease";
          setTimeout(() => toast.remove(), 300);
        }, 5000);
      };

      window.generateRiskInsight = function () {
        const accounts = Store.accounts
          .map(
            (a) =>
              `${a.name} (${a.type}): Balance $${a.balance}, Equity $${a.equity}, Risk ${a.risk}%`,
          )
          .join("\n");
        const thresholds = `Safe: ${Store.settings.riskThresholds.safe}%, Med: ${Store.settings.riskThresholds.med}%`;
        const openRisk = Store.settings.openRisk;

        const prompt = `Analyze the following portfolio risk data and provide 2-3 actionable risk mitigation strategies or warnings.
            
            Accounts:
            ${accounts || "No accounts logged."}
            
            Risk Thresholds: ${thresholds}
            Current Open Risk: $${openRisk}
            
            Focus on exposure, drawdowns, and potential margin issues.`;

        callGemini(prompt, "risk-insight-output", "btn-risk-insight");
      };

      window.generateTradeInsights = function () {
        const recentTrades = Store.trades
          .slice(0, 30)
          .map(
            (t) =>
              `Asset: ${t.asset}, R: ${t.r}, Duration: ${t.duration || "N/A"}, Plan RR: ${t.plannedR || "N/A"}, Exit RR: ${t.exitR || "N/A"}, Mistake: ${t.mistake || "None"}, Emotion: ${t.emotion || "None"}, Session: ${t.session || "N/A"}, Model: ${t.entryModel || "N/A"}, Notes: ${t.notes || "None"}`,
          )
          .join("\n");

        const prompt = `You are an elite trading coach and quantitative analyst. Analyze the following recent trades (up to 30) from my trading journal.
            
            Recent Trades Data:
            ${recentTrades || "No trades logged yet."}
            
            Please provide a concise, highly actionable analysis covering:
            1. **Psychological Patterns**: Identify recurring emotional triggers or behavioral loops based on the 'Emotion' and 'Mistake' fields.
            2. **Common Mistakes**: What are the most frequent errors (e.g., early exit, FOMO, over-leveraging) and how are they impacting the R-multiple?
            3. **Strategy Improvements**: Based on the Asset, Session, Entry Model, and Planned vs. Exit RR, what specific adjustments should I make to improve my win rate and profitability?
            
            Keep the response structured with clear headings and bullet points.`;

        callGemini(prompt, "trade-ai-output", "btn-trade-ai");
      };

      window.generatePsychologyInsight = function () {
        const recentTrades = Store.trades
          .slice(0, 20)
          .map(
            (t) =>
              `Result: ${t.r}R, Emotion: ${t.emotion || "None"}, Mistake: ${t.mistake || "None"}`,
          )
          .join("\n");

        const prompt = `Analyze the following recent trades (up to 20) focusing purely on trading psychology, emotions, and mistakes.
            
            Recent Trades:
            ${recentTrades || "No trades logged."}
            
            Identify any behavioral patterns (e.g., losing when anxious, specific recurring mistakes) and provide 2 actionable psychological tips to improve discipline.`;

        callGemini(prompt, "trade-insight-output", "btn-psych-insight");
      };

      window.generatePerformanceInsight = function () {
        const totalR = Store.trades.reduce((sum, t) => sum + t.r, 0);
        const wins = Store.trades.filter((t) => t.r > 0).length;
        const winRate =
          Store.trades.length > 0 ? (wins / Store.trades.length) * 100 : 0;
        const recentTrades = Store.trades
          .slice(0, 30)
          .map(
            (t) =>
              `Asset: ${t.asset}, Session: ${t.session}, Model: ${t.model}, Grade: ${t.grade}, Result: ${t.r}R`,
          )
          .join("\n");

        const prompt = `Analyze the following trading performance data.
            
            Overall Stats: Total R: ${totalR}, Win Rate: ${winRate.toFixed(1)}%
            
            Recent Trades (up to 30):
            ${recentTrades || "No trades logged."}
            
            Identify which assets, sessions, or models are performing best/worst. Provide 2-3 actionable suggestions on what to focus on or avoid.`;

        callGemini(prompt, "trade-insight-output", "btn-perf-insight");
      };

      window.generateAllocationInsight = function () {
        const accounts = Store.accounts
          .map(
            (a) =>
              `${a.name} (${a.type}): Balance $${a.balance}, Equity $${a.equity}`,
          )
          .join("\n");
        const allocations = Store.allocations
          .map(
            (a) =>
              `${a.date} - ${a.accountName || "Unknown"}: $${a.amount} (Phase ${a.phase}) -> Lifestyle: $${a.lifestyle}, Emergency: $${a.emergency}, Recap: $${a.recap}, Investment: $${a.investment}`,
          )
          .join("\n");
        const milestones = Store.milestones
          .map((m) => `${m.name}: Target ${m.target} ${m.metric}`)
          .join("\n");

        const prompt = `Analyze the following capital allocation and account data.
            
            Accounts:
            ${accounts || "No accounts logged."}
            
            Recent Allocations (History):
            ${allocations || "No allocations history."}
            
            Milestones:
            ${milestones || "No milestones set."}
            
            Provide 2-3 strategic suggestions on capital scaling, diversification, or how to optimize payouts to reach the milestones faster. Format the response clearly with bullet points.`;

        callGemini(prompt, "alloc-insight-output", "btn-alloc-insight");
      };

      async function hashPassword(password) {
        if (!crypto || !crypto.subtle) {
          console.warn(
            "crypto.subtle is not available. Using insecure fallback hash.",
          );
          let hash = 0;
          for (let i = 0; i < password.length; i++) {
            const char = password.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash;
          }
          return hash.toString(16);
        }
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
      }

      window.exportToPDF = function () {
        const element = document.getElementById("main-content");
        const activeView = document.querySelector(".view.active");
        const viewName = activeView ? activeView.id.toUpperCase() : "REPORT";

        const opt = {
          margin: 10,
          filename: `QuantEdge_${viewName}_${new Date().toISOString().split("T")[0]}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, backgroundColor: "#09090b", useCORS: true },
          jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
        };

        html2pdf().set(opt).from(element).save();
      };

      const commands = [
        {
          icon: "layout-dashboard",
          label: "Go to Dashboard",
          action: () => switchView("dashboard"),
        },
        {
          icon: "book-open",
          label: "Go to Trade Journal",
          action: () => switchView("trade-journal"),
        },
        {
          icon: "activity",
          label: "Go to Risk Engine",
          action: () => switchView("risk"),
        },
        {
          icon: "plus",
          label: "Add New Trade",
          action: () => openModal("add-trade"),
        },
        {
          icon: "wallet",
          label: "Add New Account",
          action: () => openModal("add-account"),
        },
        {
          icon: "file-text",
          label: "Export Current View to PDF",
          action: () => exportToPDF(),
        },
        { icon: "sun", label: "Toggle Theme", action: () => toggleTheme() },
        {
          icon: "settings",
          label: "Open Settings",
          action: () => switchView("settings"),
        },
      ];

      window.filterCommands = function () {
        const query = document
          .getElementById("command-input")
          .value.toLowerCase();
        const results = document.getElementById("command-results");
        const filtered = commands.filter((c) =>
          c.label.toLowerCase().includes(query),
        );

        results.innerHTML = filtered
          .map(
            (c, i) => `
                <div class="nav-item" style="margin-bottom: 4px; cursor: pointer;" onclick="executeCommand(${commands.indexOf(c)})">
                    <i data-lucide="${c.icon}"></i>
                    <span>${c.label}</span>
                </div>
            `,
          )
          .join("");
        lucide.createIcons({ root: results });
      };

      window.executeCommand = function (index) {
        commands[index].action();
        closeCommandPalette();
      };

      window.openCommandPalette = function () {
        document.getElementById("command-palette").style.display = "flex";
        document.getElementById("command-input").focus();
        filterCommands();
      };

      window.closeCommandPalette = function () {
        document.getElementById("command-palette").style.display = "none";
        document.getElementById("command-input").value = "";
      };

      document.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "k") {
          e.preventDefault();
          openCommandPalette();
        }
        if (e.key === "Escape") {
          closeCommandPalette();
        }
      });

      window.startVoiceRecognition = function (targetId) {
        if (!("webkitSpeechRecognition" in window)) {
          alert("Speech recognition is not supported in this browser.");
          return;
        }
        const recognition = new webkitSpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = "en-US";

        const btn = event.currentTarget;
        const originalContent = btn.innerHTML;
        btn.innerHTML =
          '<i data-lucide="loader" class="spin" style="width:12px"></i> Listening...';
        lucide.createIcons({ root: btn });

        recognition.onresult = (event) => {
          const transcript = event.results[0][0].transcript;
          document.getElementById(targetId).value +=
            (document.getElementById(targetId).value ? " " : "") + transcript;
        };

        recognition.onend = () => {
          btn.innerHTML = originalContent;
          lucide.createIcons({ root: btn });
        };

        recognition.onerror = (event) => {
          console.error("Speech recognition error:", event.error);
          btn.innerHTML = originalContent;
          lucide.createIcons({ root: btn });
        };

        recognition.start();
      };

      window.updateRedZoneAnalysis = function () {
        const trades = Store.trades;
        if (trades.length < 5) return;

        const dayStats = {};
        const hourStats = {};
        const assetStats = {};

        trades.forEach((t) => {
          const date = new Date(t.date);
          const day = date.toLocaleDateString("en-US", { weekday: "long" });
          const hour = date.getHours();
          const asset = t.asset;
          const r = parseFloat(t.r) || 0;

          dayStats[day] = (dayStats[day] || 0) + r;
          hourStats[hour] = (hourStats[hour] || 0) + r;
          assetStats[asset] = (assetStats[asset] || 0) + r;
        });

        const worstDay = Object.keys(dayStats).reduce((a, b) =>
          dayStats[a] < dayStats[b] ? a : b,
        );
        const worstHour = Object.keys(hourStats).reduce((a, b) =>
          hourStats[a] < hourStats[b] ? a : b,
        );
        const worstAsset = Object.keys(assetStats).reduce((a, b) =>
          assetStats[a] < assetStats[b] ? a : b,
        );

        document.getElementById("red-zone-day").innerText = worstDay;
        document.getElementById("red-zone-hour").innerText = worstHour + ":00";
        document.getElementById("red-zone-asset").innerText = worstAsset;

        const losingTrades = trades.filter(
          (t) => (parseFloat(t.r) || 0) < 0,
        ).length;
        const prob = ((losingTrades / trades.length) * 100).toFixed(1);
        document.getElementById("red-zone-prob").innerText = prob + "%";

        document.getElementById("red-zone-insight").innerHTML = `
                <i data-lucide="alert-circle" style="width:14px; vertical-align: middle;"></i>
                High risk detected on <strong>${worstDay}s</strong> around <strong>${worstHour}:00 UTC</strong>. 
                Trading <strong>${worstAsset}</strong> during these times has historically led to significant drawdown.
            `;
        lucide.createIcons({
          root: document.getElementById("red-zone-insight"),
        });
      };

      window.runMonteCarlo = function () {
        const winRate =
          parseFloat(document.getElementById("mc-winrate").value) / 100;
        const reward = parseFloat(document.getElementById("mc-reward").value);
        const risk = parseFloat(document.getElementById("mc-risk").value) / 100;
        const iterations = 1000;
        const tradesPerSim = 100;

        let totalDrawdown = 0;
        let ruinCount = 0;
        let maxDrawdown = 0;

        for (let i = 0; i < iterations; i++) {
          let balance = 1;
          let peak = 1;
          let currentDD = 0;
          let simMaxDD = 0;

          for (let j = 0; j < tradesPerSim; j++) {
            if (Math.random() < winRate) {
              balance *= 1 + risk * reward;
            } else {
              balance *= 1 - risk;
            }

            if (balance > peak) peak = balance;
            currentDD = (peak - balance) / peak;
            if (currentDD > simMaxDD) simMaxDD = currentDD;
            if (balance < 0.5) {
              ruinCount++;
              break;
            } // 50% drawdown = ruin for many prop firms
          }
          maxDrawdown += simMaxDD;
        }

        const avgMaxDD = ((maxDrawdown / iterations) * 100).toFixed(2);
        const ruinProb = ((ruinCount / iterations) * 100).toFixed(2);

        document.getElementById("mc-results").innerHTML = `
                <div style="margin-bottom: 12px;">
                    <div class="stat-label">Avg Max Drawdown</div>
                    <div class="stat-value" style="color: var(--warning);">${avgMaxDD}%</div>
                </div>
                <div>
                    <div class="stat-label">Prob. of 50% Drawdown</div>
                    <div class="stat-value" style="color: var(--danger);">${ruinProb}%</div>
                </div>
                <p style="margin-top: 16px; font-size: 0.8rem;">Based on 1,000 simulations of 100 trades each. This assumes constant risk and independent outcomes.</p>
            `;
      };

      window.optimizePayout = function () {
        const amount = parseFloat(document.getElementById("opt-payout").value);
        if (!amount) return;

        const splits = [
          {
            label: "Lifestyle / Pay Yourself",
            pct: 40,
            color: "var(--success)",
            icon: "home",
          },
          {
            label: "Tax Reserve",
            pct: 25,
            color: "var(--warning)",
            icon: "landmark",
          },
          {
            label: "New Challenges",
            pct: 20,
            color: "var(--primary)",
            icon: "trending-up",
          },
          {
            label: "Personal Compounding",
            pct: 15,
            color: "var(--primary)",
            icon: "layers",
          },
        ];

        const results = document.getElementById("payout-optimization-results");
        results.innerHTML = splits
          .map(
            (s) => `
                <div style="padding: 16px; background: var(--bg); border-radius: 8px; border: 1px solid var(--border); text-align: center;">
                    <i data-lucide="${s.icon}" style="color: ${s.color}; margin-bottom: 8px;"></i>
                    <div class="stat-label">${s.label} (${s.pct}%)</div>
                    <div class="stat-value" style="font-size: 1.1rem;">$${((amount * s.pct) / 100).toLocaleString()}</div>
                </div>
            `,
          )
          .join("");
        lucide.createIcons({ root: results });
      };

      window.renderAlphaChart = function () {
        const ctx = document.getElementById("alphaChart").getContext("2d");
        if (window.alphaChartInstance) window.alphaChartInstance.destroy();

        const trades = Store.trades.slice(-20); // Last 20 trades
        const labels = trades.map((_, i) => i + 1);
        const actualData = [];
        const plannedData = [];
        let actualSum = 0;
        let plannedSum = 0;

        trades.forEach((t) => {
          actualSum += parseFloat(t.r) || 0;
          plannedSum += parseFloat(t.plannedR) || parseFloat(t.r) || 0;
          actualData.push(actualSum);
          plannedData.push(plannedSum);
        });

        window.alphaChartInstance = new Chart(ctx, {
          type: "line",
          data: {
            labels,
            datasets: [
              {
                label: "Actual Performance (R)",
                data: actualData,
                borderColor: "#3b82f6",
                backgroundColor: "rgba(59, 130, 246, 0.1)",
                fill: true,
                tension: 0.4,
              },
              {
                label: "Planned Performance (R)",
                data: plannedData,
                borderColor: "#10b981",
                borderDash: [5, 5],
                fill: false,
                tension: 0.4,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: true, labels: { color: "#71717a" } },
            },
            scales: {
              x: { grid: { display: false }, ticks: { color: "#71717a" } },
              y: { grid: { color: "#27272a" }, ticks: { color: "#71717a" } },
            },
          },
        });
      };

      window.renderStrategyCorrelationMatrix = function () {
        const trades = Store.trades;
        const strategies = [
          ...new Set(trades.map((t) => t.model).filter(Boolean)),
        ];
        const assets = [...new Set(trades.map((t) => t.asset).filter(Boolean))];

        if (strategies.length === 0) {
          document.getElementById("strategy-correlation-matrix").innerHTML =
            '<p style="color: var(--muted); text-align: center;">Log more trades with "Entry Models" to see strategy correlation.</p>';
          return;
        }

        let html = "<table><thead><tr><th>Strategy</th>";
        assets.forEach((a) => (html += `<th>${a}</th>`));
        html += "</tr></thead><tbody>";

        strategies.forEach((s) => {
          html += `<tr><td><strong>${s}</strong></td>`;
          assets.forEach((a) => {
            const count = trades.filter(
              (t) => t.model === s && t.asset === a,
            ).length;
            const pct = (
              (count / trades.filter((t) => t.model === s).length) *
              100
            ).toFixed(0);
            const opacity = count > 0 ? Math.min(0.1 + count * 0.1, 0.8) : 0;
            html += `<td style="background: rgba(59, 130, 246, ${opacity}); text-align: center;">${count > 0 ? pct + "%" : "-"}</td>`;
          });
          html += "</tr>";
        });

        html += "</tbody></table>";
        document.getElementById("strategy-correlation-matrix").innerHTML = html;
      };

      window.handleAuth = async function () {
        console.log("handleAuth triggered");
        const passwordInput = document.getElementById("lock-password");
        const secondaryInput = document.getElementById(
          "lock-secondary-password",
        );
        const password = passwordInput.value;
        const secondaryPassword = secondaryInput.value;

        if (!password) {
          console.log("No password entered");
          return;
        }

        try {
          const storedHash = localStorage.getItem("qe_password_hash");
          console.log("Stored hash exists:", !!storedHash);
          const inputHash = await hashPassword(password);
          console.log("Input hash generated");

          if (!storedHash) {
            console.log("First time setup");
            // First time setup
            if (!secondaryPassword) {
              alert(
                "Please provide a secondary password for account recovery.",
              );
              return;
            }
            const secondaryHash = await hashPassword(secondaryPassword);
            localStorage.setItem("qe_password_hash", inputHash);
            localStorage.setItem("qe_secondary_password_hash", secondaryHash);
            sessionStorage.setItem("qe_authenticated", "true");
            console.log("Calling unlockApp() for first time setup");
            unlockApp();
          } else if (storedHash === inputHash) {
            console.log("Password match");
            sessionStorage.setItem("qe_authenticated", "true");
            console.log("Calling unlockApp() for successful login");
            unlockApp();
          } else {
            console.log("Invalid password");
            alert("Invalid password. Access denied.");
            passwordInput.value = "";
          }
        } catch (error) {
          console.error("Error in handleAuth:", error);
          alert(
            "An error occurred during authentication. Check console for details.",
          );
        }
      };

      window.resetSystem = async function () {
        if (
          confirm(
            "WARNING: This will clear all local data, passwords, and caches. You will lose all your data. Are you sure?",
          )
        ) {
          localStorage.clear();
          sessionStorage.clear();
          if ("serviceWorker" in navigator) {
            const registrations =
              await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) {
              await registration.unregister();
            }
          }
          if ("caches" in window) {
            const cachesKeys = await caches.keys();
            for (let key of cachesKeys) {
              await caches.delete(key);
            }
          }
          alert("System reset complete. Reloading...");
          window.location.reload(true);
        }
      };

      window.showRecovery = function () {
        document.getElementById("auth-main-section").style.display = "none";
        document.getElementById("auth-recovery-section").style.display =
          "block";
        document.getElementById("lock-title").innerText = "Password Recovery";
        document.getElementById("lock-desc").innerText =
          "Use your secondary password to reset your main password.";
      };

      window.hideRecovery = function () {
        document.getElementById("auth-main-section").style.display = "block";
        document.getElementById("auth-recovery-section").style.display = "none";
        document.getElementById("lock-title").innerText = "Secure Access";
        document.getElementById("lock-desc").innerText =
          "Please enter your password to unlock the system.";
      };

      window.handleRecovery = async function () {
        const recoveryInput = document.getElementById("recovery-password");
        const recoveryPassword = recoveryInput.value;
        if (!recoveryPassword) return;

        const storedSecondaryHash = localStorage.getItem(
          "qe_secondary_password_hash",
        );
        if (!storedSecondaryHash) {
          alert("No secondary password was set for this account.");
          return;
        }

        const inputHash = await hashPassword(recoveryPassword);
        if (storedSecondaryHash === inputHash) {
          // Reset main password
          localStorage.removeItem("qe_password_hash");
          alert(
            "Secondary password verified. You can now set a new main password.",
          );
          location.reload();
        } else {
          alert("Invalid secondary password.");
          recoveryInput.value = "";
        }
      };

      function unlockApp() {
        document.getElementById("lock-screen").style.display = "none";
        document.getElementById("app-sidebar").style.display = "flex";
        document.getElementById("main-content").style.display = "block";
        try {
          renderAll();
        } catch (e) {
          console.error("Error in renderAll:", e);
          alert(
            "There was an error loading your data. You may need to reset the system if it's corrupted.",
          );
        }
        lucide.createIcons();
      }

      window.resetPassword = function () {
        if (
          confirm(
            "Are you sure you want to reset your password? You will be logged out.",
          )
        ) {
          localStorage.removeItem("qe_password_hash");
          sessionStorage.removeItem("qe_authenticated");
          location.reload();
        }
      };

      function updateSettingsInputs() {
        document.getElementById("threshold-safe").value =
          Store.settings.riskThresholds.safe;
        document.getElementById("threshold-med").value =
          Store.settings.riskThresholds.med;
        document.getElementById("prop-reinvestment-pct").value =
          Store.settings.propReinvestmentPct || 100;

        const storedApiKey = localStorage.getItem("qe_gemini_api_key");
        if (storedApiKey) {
          document.getElementById("api-key-input").value = storedApiKey;
        }

        if (Store.settings.webhooks) {
          document.getElementById("webhook-discord").value =
            Store.settings.webhooks.discord || "";
          document.getElementById("webhook-telegram-token").value =
            Store.settings.webhooks.telegramToken || "";
          document.getElementById("webhook-telegram-chat").value =
            Store.settings.webhooks.telegramChat || "";
        }
      }

      window.saveApiKey = function () {
        const key = document.getElementById("api-key-input").value;
        if (key) {
          localStorage.setItem("qe_gemini_api_key", key);
          Store.settings.geminiApiKey = key;
          Store.save();
          alert("API Key saved securely to your device.");
        } else {
          localStorage.removeItem("qe_gemini_api_key");
          Store.settings.geminiApiKey = "";
          Store.save();
          alert("API Key removed.");
        }
      };

      // --- AI Insights System ---
      window.generateAIInsights = async function () {
        const btn = document.getElementById("ai-gen-btn");
        const loading = document.getElementById("ai-loading");
        const responseDiv = document.getElementById("ai-response");

        if (btn.disabled) return;

        if (!navigator.onLine) {
          responseDiv.innerHTML = `
                    <div style="color: var(--warning); text-align: center; margin-top: 50px;">
                        <i data-lucide="wifi-off" style="width: 48px; height: 48px; margin-bottom: 16px;"></i>
                        <p>You are currently offline. AI Insights require an active internet connection.</p>
                    </div>
                `;
          lucide.createIcons();
          return;
        }

        const apiKey = localStorage.getItem("qe_gemini_api_key") || window.ENV_GEMINI_API_KEY;
        if (!apiKey) {
          responseDiv.innerHTML = `
                    <div style="color: var(--warning); text-align: center; margin-top: 50px;">
                        <i data-lucide="key" style="width: 48px; height: 48px; margin-bottom: 16px;"></i>
                        <p>API Key Missing</p>
                        <p style="font-size: 0.9rem; margin-top: 8px; opacity: 0.8;">Please configure your Gemini API Key in the Settings menu to use this feature.</p>
                        <button onclick="switchView('settings')" style="margin-top: 16px;">Go to Settings</button>
                    </div>
                `;
          lucide.createIcons();
          return;
        }

        btn.disabled = true;
        loading.style.display = "flex";
        responseDiv.innerHTML = "";

        try {
          const { GoogleGenAI } = await import("https://esm.run/@google/genai");
          const ai = new GoogleGenAI({ apiKey: apiKey });

          const portfolioData = {
            accounts: Store.accounts.map((a) => ({
              name: a.name,
              balance: a.balance,
              equity: a.equity,
              type: a.type,
              assetClass: a.assetClass,
              phase: a.phase,
              status: a.status,
              profitTarget: a.profitTarget,
              maxDrawdown: a.maxDrawdown,
            })),
            transactions: Store.transactions.slice(0, 50),
            allocations: Store.allocations,
            riskThresholds: Store.settings.riskThresholds,
            overallStats: {
              totalBalance: Store.accounts.reduce((sum, a) => sum + a.balance, 0),
              totalEquity: Store.accounts.reduce((sum, a) => sum + a.equity, 0),
            }
          };

          const prompt = `
                    You are a senior quantitative risk analyst and hedge fund architect. 
                    Analyze the following portfolio data and provide an extremely detailed, institutional-grade insights report.
                    
                    Portfolio Data:
                    ${JSON.stringify(portfolioData, null, 2)}
                    
                    Please provide a comprehensive analysis covering the following areas:
                    
                    1. **Capital Allocation Audit**: 
                       - Evaluate the efficiency of capital distribution across asset classes and account types.
                       - Assess if the current allocation aligns with optimal growth strategies.
                       - Identify any underutilized capital or over-allocated segments.
                       
                    2. **Risk Exposure Analysis**: 
                       - Identify critical concentration risks across accounts or asset classes.
                       - Analyze drawdown vulnerabilities based on the provided max drawdowns and current equity.
                       - Evaluate the risk thresholds and their effectiveness in the current portfolio state.
                       
                    3. **Strategic Recommendations**: 
                       - Suggest specific, actionable adjustments to allocation phases.
                       - Recommend changes to risk thresholds to optimize for long-term growth and capital preservation.
                       - Provide strategies for scaling accounts that are near their profit targets.
                       
                    4. **Performance Alpha & ROI Trends**: 
                       - Evaluate the current ROI trends based on recent transactions and account growth.
                       - Suggest ways to improve the profit-to-withdrawal ratio.
                       - Identify the best performing asset classes or account types and how to leverage them.
                    
                    Format the response using Markdown with professional headings (H3 for main sections), bullet points, and a concluding "Executive Summary" (H2). 
                    Ensure the tone is highly professional, analytical, and actionable.
                `;

          const response = await ai.models.generateContent({
            model: "gemini-3.1-pro-preview",
            contents: prompt,
          });

          const text = response.text;

          // Simple markdown-like formatter
          const formattedText = text
            .replace(/^### (.*$)/gm, "<h3>$1</h3>")
            .replace(/^## (.*$)/gm, "<h2>$1</h2>")
            .replace(/^# (.*$)/gm, "<h1>$1</h1>")
            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
            .replace(/\*(.*?)\*/g, "<em>$1</em>")
            .replace(/\n\n/g, "<br><br>")
            .replace(/\n\* /g, "<br>• ")
            .replace(/\n- /g, "<br>• ");

          responseDiv.innerHTML = formattedText;
        } catch (error) {
          console.error("AI Analysis Error:", error);
          responseDiv.innerHTML = `
                    <div style="color: var(--danger); text-align: center; margin-top: 50px;">
                        <i data-lucide="alert-circle" style="width: 48px; height: 48px; margin-bottom: 16px;"></i>
                        <p>Failed to generate analysis. Please check your API configuration or try again later.</p>
                        <p style="font-size: 0.8rem; margin-top: 8px; opacity: 0.7;">${error.message}</p>
                    </div>
                `;
        } finally {
          loading.style.display = "none";

          // Add a 30-second cooldown to respect free tier limits
          let cooldown = 30;
          btn.innerText = `Cooldown (${cooldown}s)`;
          const timer = setInterval(() => {
            cooldown--;
            if (cooldown <= 0) {
              clearInterval(timer);
              btn.disabled = false;
              btn.innerHTML =
                '<i data-lucide="sparkles"></i> Generate Analysis';
              lucide.createIcons();
            } else {
              btn.innerText = `Cooldown (${cooldown}s)`;
            }
          }, 1000);
        }
      };

      window.saveRiskThresholds = function () {
        const safe =
          parseFloat(document.getElementById("threshold-safe").value) || 0;
        const med =
          parseFloat(document.getElementById("threshold-med").value) || 0;

        Store.settings.riskThresholds.safe = safe;
        Store.settings.riskThresholds.med = med;
        Store.save();
        updateRiskEngine();
      };

      window.savePropReinvestmentPct = function () {
        const pct =
          parseFloat(document.getElementById("prop-reinvestment-pct").value) ||
          100;
        Store.settings.propReinvestmentPct = pct;
        Store.save();
      };

      // --- Backup System ---
      window.exportData = function () {
        const data = {};
        for (const key in Store) {
          if (typeof Store[key] !== "function") {
            data[key] = Store[key];
          }
        }
        data.version = "1.0";
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `quantedge_backup_${new Date().toISOString().split("T")[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      };

      window.exportPDFReport = function () {
        // Switch to dashboard view temporarily to capture it
        const currentView = document.querySelector(".view.active").id;
        switchView("dashboard");

        setTimeout(() => {
          const element = document.getElementById("dashboard");
          const opt = {
            margin: 0.5,
            filename: `QuantEdge_Report_${new Date().toISOString().split("T")[0]}.pdf`,
            image: { type: "jpeg", quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: "in", format: "a4", orientation: "portrait" },
          };

          html2pdf()
            .set(opt)
            .from(element)
            .save()
            .then(() => {
              switchView(currentView); // Restore view
            });
        }, 500); // Wait for charts to render
      };

      window.saveWebhooks = function () {
        Store.settings.webhooks = {
          discord: document.getElementById("webhook-discord").value,
          telegramToken: document.getElementById("webhook-telegram-token")
            .value,
          telegramChat: document.getElementById("webhook-telegram-chat").value,
        };
        Store.save();
      };

      window.sendTestWebhook = async function () {
        const webhooks = Store.settings.webhooks;
        if (!webhooks) {
          alert("Please configure webhook URLs first.");
          return;
        }

        const totalBal = Store.accounts.reduce(
          (sum, a) => sum + (a.balance || 0),
          0,
        );
        const totalEq = Store.accounts.reduce(
          (sum, a) => sum + (a.equity || 0),
          0,
        );
        const message = `📊 **QuantEdge Daily Summary**\nDate: ${new Date().toLocaleDateString()}\nTotal Balance: $${totalBal.toLocaleString()}\nTotal Equity: $${totalEq.toLocaleString()}`;

        try {
          if (webhooks.discord) {
            await fetch(webhooks.discord, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content: message }),
            });
          }

          if (webhooks.telegramToken && webhooks.telegramChat) {
            const url = `https://api.telegram.org/bot${webhooks.telegramToken}/sendMessage`;
            await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: webhooks.telegramChat,
                text: message,
              }),
            });
          }
          alert("Test webhook sent successfully!");
        } catch (e) {
          alert("Error sending webhook: " + e.message);
        }
      };

      window.importData = function (event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
          try {
            const data = JSON.parse(e.target.result);
            if (!data.accounts || !data.transactions || !data.settings) {
              throw new Error("Invalid backup format");
            }

            Store.accounts = data.accounts || [];
            Store.transactions = data.transactions || [];
            Store.debriefs = data.debriefs || [];
            Store.weeklyReviews = data.weeklyReviews || [];
            Store.allocations = data.allocations || [];
            Store.wishlist = data.wishlist || [];
            Store.investments = data.investments || [];
            Store.payouts = data.payouts || [];
            Store.milestones = data.milestones || [];
            Store.trades = data.trades || [];
            Store.activeTrades = data.activeTrades || [];
            Store.plannedTrades = data.plannedTrades || [];
            Store.backtests = data.backtests || [];
            Store.planner = data.planner || {};
            Store.snapshots = data.snapshots || {};
            Store.scalingMilestones = data.scalingMilestones || [];
            Store.expenses = data.expenses || [];
            Store.budgets = data.budgets || [];
            Store.stocks = data.stocks || [];
            Store.dividends = data.dividends || [];
            Store.locks = data.locks || [];
            if (data.journalConfig) Store.journalConfig = data.journalConfig;
            if (data.settings) Store.settings = data.settings;

            Store.save();
            renderAll();
            alert("Data imported successfully!");
          } catch (err) {
            alert("Error importing data: " + err.message);
          }
        };
        reader.readAsText(file);
      };

      window.importCSV = function (event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
          try {
            const text = e.target.result;
            const lines = text.split("\n");
            let importedCount = 0;

            // Simple CSV parser assuming: Date, Asset, R-Multiple
            // Skip header (i=1)
            for (let i = 1; i < lines.length; i++) {
              const line = lines[i].trim();
              if (!line) continue;

              const parts = line.split(",");
              if (parts.length >= 3) {
                const date = parts[0].trim();
                const asset = parts[1].trim();
                const rMult = parseFloat(parts[2].trim());

                if (date && asset && !isNaN(rMult)) {
                  Store.trades.unshift({
                    id: Date.now() + i,
                    asset,
                    date,
                    session: "Unknown",
                    model: "CSV Import",
                    grade: "B",
                    r: rMult,
                    impulsive: "No",
                    psych: "",
                  });
                  importedCount++;
                }
              }
            }

            if (importedCount > 0) {
              Store.save();
              renderAll();
              alert(`Successfully imported ${importedCount} trades!`);
            } else {
              alert(
                "No valid trades found in CSV. Expected format: Date, Asset, R-Multiple",
              );
            }
          } catch (err) {
            alert("Error parsing CSV: " + err.message);
          }
        };
        reader.readAsText(file);
      };

      // --- State Management ---
      const getLocal = (key, fallback) => {
        try {
          const val = localStorage.getItem(key);
          if (!val) return fallback;
          const parsed = JSON.parse(val);

          // Handle Array fallback
          if (Array.isArray(fallback)) {
            return Array.isArray(parsed) ? parsed : fallback;
          }

          // Handle Object fallback (shallow merge)
          if (fallback !== null && typeof fallback === "object") {
            if (parsed !== null && typeof parsed === "object") {
              return { ...fallback, ...parsed };
            }
            return fallback;
          }

          return parsed !== null ? parsed : fallback;
        } catch (e) {
          return fallback;
        }
      };

      const Store = {
        accounts: getLocal("qe_accounts", []),
        transactions: getLocal("qe_transactions", []),
        debriefs: getLocal("qe_debriefs", []),
        weeklyReviews: getLocal("qe_weekly_reviews", []),
        allocations: getLocal("qe_allocations", []),
        wishlist: getLocal("qe_wishlist", []),
        investments: getLocal("qe_investments", []),
        payouts: getLocal("qe_payouts", []),
        milestones: getLocal("qe_milestones", []),
        trades: getLocal("qe_trades", []),
        activeTrades: getLocal("qe_active_trades", []),
        plannedTrades: getLocal("qe_planned_trades", []),
        backtests: getLocal("qe_backtests", []),
        planner: getLocal("qe_planner", {}),
        snapshots: getLocal("qe_snapshots", {}),
        scalingMilestones: getLocal("qe_scaling_milestones", []),
        expenses: getLocal("qe_expenses", []),
        budgets: getLocal("qe_budgets", []),
        stocks: getLocal("qe_stocks", []),
        dividends: getLocal("qe_dividends", []),
        locks: getLocal("qe_locks", []),
        journalConfig: getLocal("qe_journal_config", {
          pairs: ["EURUSD", "GBPUSD", "XAUUSD", "US30", "NAS100"],
          setups: ["OB", "FVG", "MSS", "Liquidity Sweep", "AMD", "Other"],
          confluences: ["HTF zone", "Liquidity taken", "MSS confirmed", "FVG present", "Session timing"]
        }),
        settings: getLocal("qe_settings", {
          riskThresholds: { safe: 2, med: 5 },
          openRisk: 0,
          maxAllowedDD: 10,
          geminiApiKey: localStorage.getItem("qe_gemini_api_key") || "",
          dashboardOrder: getLocal("qe_dashboard_order", [
            "aum",
            "equity",
            "risk",
            "cashflow",
            "equity-chart",
            "dist-chart",
            "leaderboard",
            "milestones",
            "engines",
          ]),
          phases: {
            1: {
              withdrawal: 0.3,
              split: {
                lifestyle: 0.4,
                emergency: 0.2,
                recap: 0.2,
                investment: 0.2,
              },
            },
            2: {
              withdrawal: 0.4,
              split: {
                lifestyle: 0.3,
                emergency: 0.2,
                recap: 0.2,
                investment: 0.3,
              },
            },
            3: {
              withdrawal: 0.5,
              split: {
                lifestyle: 0.2,
                emergency: 0.1,
                recap: 0.2,
                investment: 0.5,
              },
            },
          },
        }),

        save() {
          try {
            localStorage.setItem("qe_accounts", JSON.stringify(this.accounts));
            localStorage.setItem(
              "qe_transactions",
              JSON.stringify(this.transactions),
            );
            localStorage.setItem(
              "qe_allocations",
              JSON.stringify(this.allocations),
            );
            localStorage.setItem("qe_wishlist", JSON.stringify(this.wishlist));
            localStorage.setItem(
              "qe_investments",
              JSON.stringify(this.investments),
            );
            localStorage.setItem("qe_payouts", JSON.stringify(this.payouts));
            localStorage.setItem(
              "qe_milestones",
              JSON.stringify(this.milestones),
            );
            localStorage.setItem("qe_trades", JSON.stringify(this.trades));
            localStorage.setItem(
              "qe_active_trades",
              JSON.stringify(this.activeTrades),
            );
            localStorage.setItem(
              "qe_planned_trades",
              JSON.stringify(this.plannedTrades),
            );
            localStorage.setItem(
              "qe_backtests",
              JSON.stringify(this.backtests),
            );
            localStorage.setItem("qe_planner", JSON.stringify(this.planner));
            localStorage.setItem(
              "qe_snapshots",
              JSON.stringify(this.snapshots),
            );
            localStorage.setItem(
              "qe_scaling_milestones",
              JSON.stringify(this.scalingMilestones),
            );
            localStorage.setItem(
              "qe_journal_config",
              JSON.stringify(this.journalConfig),
            );
            localStorage.setItem("qe_expenses", JSON.stringify(this.expenses));
            localStorage.setItem("qe_budgets", JSON.stringify(this.budgets));
            localStorage.setItem("qe_stocks", JSON.stringify(this.stocks));
            localStorage.setItem("qe_dividends", JSON.stringify(this.dividends));
            localStorage.setItem("qe_locks", JSON.stringify(this.locks));
            localStorage.setItem("qe_debriefs", JSON.stringify(this.debriefs));
            localStorage.setItem("qe_weekly_reviews", JSON.stringify(this.weeklyReviews));
            localStorage.setItem("qe_settings", JSON.stringify(this.settings));

            if (window.SyncEngine && window.SyncEngine.isSyncing) {
              window.SyncEngine.syncAll(this);
            }

            if (sessionStorage.getItem("qe_authenticated")) {
              renderAll();
            }
          } catch (e) {
            console.error("Error saving to localStorage:", e);
          }
        },
      };

      // --- Automated Daily Snapshots ---
      window.checkDailySnapshots = function () {
        const now = new Date();
        // Check if it's past 17:00 (5 PM) in America/New_York
        const nyTime = new Date(
          now.toLocaleString("en-US", { timeZone: "America/New_York" }),
        );
        if (nyTime.getHours() >= 17) {
          const dateStr = nyTime.toISOString().split("T")[0];
          if (!Store.snapshots[dateStr]) {
            Store.snapshots[dateStr] = {};
            Store.accounts.forEach((acc) => {
              Store.snapshots[dateStr][acc.id] = {
                balance: acc.balance || 0,
                equity: acc.equity || 0,
              };
            });
            Store.save();
            console.log(`Daily snapshot taken for ${dateStr}`);
          }
        }
      };

      setInterval(checkDailySnapshots, 60000); // Check every minute
      checkDailySnapshots(); // Check on load

      // --- UI Logic ---
      window.switchView = function (viewId) {
        document
          .querySelectorAll(".view")
          .forEach((v) => v.classList.remove("active"));
        document
          .querySelectorAll(".nav-item")
          .forEach((n) => n.classList.remove("active"));

        const targetView = document.getElementById(viewId);
        if (targetView) targetView.classList.add("active");

        // Find the nav item that was clicked
        const navItems = document.querySelectorAll(".nav-item");
        navItems.forEach((item) => {
          if (item.getAttribute("onclick").includes(`'${viewId}'`)) {
            item.classList.add("active");
          }
        });

        if (viewId === "dashboard") updateCharts();
        if (viewId === "trade-journal") updateTradeCharts();
        if (viewId === "money-flow" && typeof updateMoneyFlow === "function")
          updateMoneyFlow();
        if (
          viewId === "performance-metrics" &&
          typeof updatePerformanceMetrics === "function"
        )
          updatePerformanceMetrics();
        if (
          viewId === "trading-plan" &&
          typeof updateTradingPlanView === "function"
        )
          updateTradingPlanView();
        if (viewId === "risk") updateRiskEngine();
        if (viewId === "settings") updateSettingsInputs();
        lucide.createIcons();
      };

      window.togglePropFields = function () {
        const type = document.getElementById("acc-type").value;
        document.getElementById("prop-specific-fields").style.display =
          type === "Prop" ? "block" : "none";

        const phaseSelect = document.getElementById("acc-phase");
        phaseSelect.innerHTML = "";

        if (type === "Prop") {
          phaseSelect.innerHTML = `
                    <option value="Phase 1">Phase 1</option>
                    <option value="Phase 2">Phase 2</option>
                    <option value="Phase 3">Phase 3</option>
                    <option value="Passed">Passed</option>
                `;
        } else {
          phaseSelect.innerHTML = `
                    <option value="Personal Account">Personal Account</option>
                    <option value="Investor Account">Investor Account</option>
                    <option value="Bot Account">Bot Account</option>
                    <option value="Hedging Account">Hedging Account</option>
                `;
        }
      };

      window.openModal = function (id) {
        const modalId = id.startsWith("modal-") ? id : `modal-${id}`;
        const el = document.getElementById(modalId);
        if (el) {
          el.style.display = "flex";
        } else {
          console.warn(`Modal with ID ${modalId} not found.`);
        }
      };

      window.closeModal = function () {
        document
          .querySelectorAll(".modal-overlay")
          .forEach((m) => (m.style.display = "none"));
      };

      // --- Account Logic ---
      window.saveAccount = function () {
        const initialBalance = parseFloat(
          document.getElementById("acc-balance").value,
        );
        const scalingTarget =
          parseFloat(document.getElementById("acc-scaling-target").value) ||
          initialBalance * 1.1;
        const type = document.getElementById("acc-type").value;

        const acc = {
          id: Date.now(),
          name: document.getElementById("acc-name").value,
          firm: document.getElementById("acc-firm").value,
          type: type,
          assetClass: document.getElementById("acc-asset-class").value,
          balance: initialBalance,
          equity: initialBalance,
          scalingTarget: scalingTarget,
          phase: document.getElementById("acc-phase").value,
          risk: 0,
          status: "Active",
          history: [
            {
              date: new Date().toISOString().split("T")[0],
              balance: initialBalance,
              equity: initialBalance,
            },
          ],
        };

        if (type === "Prop") {
          acc.maxDailyDD =
            parseFloat(document.getElementById("acc-max-daily").value) || 5;
          acc.maxTotalDD =
            parseFloat(document.getElementById("acc-max-total").value) || 10;
          acc.nextPayoutDate =
            document.getElementById("acc-next-payout")?.value || null;
        }

        Store.accounts.push(acc);
        Store.save();
        closeModal();
        renderAll();
      };

      window.deleteAccount = function (id) {
        if (
          confirm(
            "Are you sure you want to permanently delete this account? This action cannot be undone.",
          )
        ) {
          Store.accounts = Store.accounts.filter((a) => a.id !== id);
          Store.save();
          renderAll();
        }
      };

      // --- Milestone Logic ---
      window.saveMilestone = function () {
        const name = document.getElementById("milestone-name").value;
        const metric = document.getElementById("milestone-metric").value;
        const target = parseFloat(
          document.getElementById("milestone-target").value,
        );

        if (!name || isNaN(target)) {
          alert("Please provide a valid name and target amount.");
          return;
        }

        Store.milestones.push({
          id: Date.now(),
          name,
          metric,
          target,
        });

        Store.save();
        closeModal();
        renderAll();
      };

      window.deleteMilestone = function (id) {
        if (confirm("Delete this milestone?")) {
          Store.milestones = Store.milestones.filter((m) => m.id !== id);
          Store.save();
          renderAll();
        }
      };

      // --- Prop Scaling AI Logic ---
      const PROP_FIRMS_DB = [
        {
          name: "FTMO",
          reputation: 5.0,
          accounts: [
            { size: 10000, fee: 155 },
            { size: 25000, fee: 250 },
            { size: 50000, fee: 345 },
            { size: 100000, fee: 540 },
            { size: 200000, fee: 1080 },
          ],
        },
        {
          name: "The5ers",
          reputation: 4.8,
          accounts: [
            { size: 10000, fee: 165 },
            { size: 20000, fee: 235 },
            { size: 60000, fee: 495 },
            { size: 100000, fee: 745 },
          ],
        },
        {
          name: "Funding Pips",
          reputation: 4.5,
          accounts: [
            { size: 10000, fee: 60 },
            { size: 25000, fee: 139 },
            { size: 50000, fee: 239 },
            { size: 100000, fee: 399 },
            { size: 200000, fee: 799 },
          ],
        },
        {
          name: "FundedNext",
          reputation: 4.6,
          accounts: [
            { size: 10000, fee: 99 },
            { size: 25000, fee: 199 },
            { size: 50000, fee: 299 },
            { size: 100000, fee: 549 },
            { size: 200000, fee: 999 },
          ],
        },
        {
          name: "Alpha Capital",
          reputation: 4.4,
          accounts: [
            { size: 10000, fee: 80 },
            { size: 25000, fee: 160 },
            { size: 50000, fee: 240 },
            { size: 100000, fee: 400 },
            { size: 200000, fee: 800 },
          ],
        },
        {
          name: "E8 Funding",
          reputation: 4.3,
          accounts: [
            { size: 10000, fee: 88 },
            { size: 25000, fee: 188 },
            { size: 50000, fee: 288 },
            { size: 100000, fee: 488 },
            { size: 200000, fee: 988 },
          ],
        },
      ];

      window.runScalingAnalysis = function () {
        const lastPayout =
          Store.payouts.length > 0
            ? Store.payouts[Store.payouts.length - 1].amount
            : 0;
        const reinvestmentPct = Store.settings.propReinvestmentPct || 100;
        const usableCapital = lastPayout * (reinvestmentPct / 100);

        if (usableCapital <= 0) {
          alert(
            "No usable capital detected. Please record a payout first or check your reinvestment settings.",
          );
          return;
        }

        const scenarios = [
          { title: "Scenario A: 3 Accounts (Diversified)", count: 3 },
          { title: "Scenario B: 2 Accounts (Balanced)", count: 2 },
          { title: "Scenario C: 1 Account (Aggressive)", count: 1 },
        ];

        const results = scenarios.map((s) => {
          const budgetPerAccount = usableCapital / s.count;
          const suggestions = [];

          for (let i = 0; i < s.count; i++) {
            const bestMatch = findBestAccount(budgetPerAccount);
            if (bestMatch) suggestions.push(bestMatch);
          }

          const totalCost = suggestions.reduce((sum, sug) => sum + sug.fee, 0);
          const unused = usableCapital - totalCost;

          return { ...s, suggestions, totalCost, unused };
        });

        renderScalingAnalysis(results, usableCapital);
      };

      function findBestAccount(budget) {
        let best = null;

        PROP_FIRMS_DB.forEach((firm) => {
          firm.accounts.forEach((acc) => {
            if (acc.fee <= budget) {
              // Priority: Higher Size > Higher Reputation > Lower Fee
              if (
                !best ||
                acc.size > best.size ||
                (acc.size === best.size && firm.reputation > best.reputation) ||
                (acc.size === best.size &&
                  firm.reputation === best.reputation &&
                  acc.fee < best.fee)
              ) {
                best = { ...acc, firm: firm.name, reputation: firm.reputation };
              }
            }
          });
        });

        return best;
      }

      function renderScalingAnalysis(results, totalBudget) {
        const grid = document.getElementById("scaling-scenarios-grid");
        const output = document.getElementById("scaling-analysis-output");
        const empty = document.getElementById("scaling-empty-state");
        const note = document.getElementById("scaling-recommendation-note");

        empty.style.display = "none";
        output.style.display = "block";

        grid.innerHTML = results
          .map((res, idx) => {
            const isBest = idx === 2; // Usually 1 account is most "efficient" in terms of capital exposure per dollar spent
            return `
                    <div class="card col-4" style="border: 1px solid ${isBest ? "var(--success)" : "var(--border)"}; position: relative;">
                        ${isBest ? '<div style="position: absolute; top: -10px; right: 10px; background: var(--success); color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 700;">RECOMMENDED</div>' : ""}
                        <div class="stat-label" style="margin-bottom: 12px; color: ${isBest ? "var(--success)" : "var(--muted)"}">${res.title}</div>
                        
                        <div style="display: flex; flex-direction: column; gap: 12px;">
                            ${
                              res.suggestions
                                .map(
                                  (s) => `
                                <div style="padding: 10px; background: rgba(24, 24, 27, 0.5); border-radius: 6px; border: 1px solid var(--border);">
                                    <div style="display: flex; justify-content: space-between; font-weight: 600; font-size: 0.9rem;">
                                        <span>${s.firm}</span>
                                        <span style="color: var(--primary)">$${(s.size / 1000).toFixed(0)}k</span>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--muted); margin-top: 4px;">
                                        <span>Fee: $${s.fee}</span>
                                        <span>Rep: ${s.reputation}/5</span>
                                    </div>
                                </div>
                            `,
                                )
                                .join("") ||
                              '<div style="color: var(--danger); font-size: 0.8rem;">Budget too low for this scenario.</div>'
                            }
                        </div>

                        <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border); font-size: 0.8rem;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                <span style="color: var(--muted)">Total Cost:</span>
                                <span style="font-weight: 600;">$${res.totalCost.toLocaleString()}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: var(--muted)">Unused Capital:</span>
                                <span style="color: var(--warning)">$${res.unused.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                `;
          })
          .join("");

        const bestScenario = results[2]; // 1 Account
        const totalExposure = bestScenario.suggestions.reduce(
          (sum, s) => sum + s.size,
          0,
        );

        note.innerHTML = `
                <div style="font-weight: 700; color: var(--success); margin-bottom: 4px;">AI Strategy Recommendation</div>
                Based on your latest payout of <strong>$${totalBudget.toLocaleString()}</strong>, the optimal path is <strong>${bestScenario.suggestions[0]?.firm || "N/A"} $${bestScenario.suggestions[0]?.size / 1000 || 0}k</strong>. 
                This maximizes your capital exposure to <strong>$${totalExposure.toLocaleString()}</strong> while maintaining a high reputation score.
            `;

        lucide.createIcons({ root: grid });
      }
      window.checkNearbyNews = function (dateStr, timeStr) {
        const container = document.getElementById("trade-nearby-news");
        if (!container) return;
        
        if (!dateStr || !timeStr || !window.todayEconomicEvents || window.todayEconomicEvents.length === 0) {
          container.style.display = "none";
          return;
        }

        const tradeDate = new Date(`${dateStr}T${timeStr}`);
        if (isNaN(tradeDate.getTime())) return;

        const nearbyEvents = window.todayEconomicEvents.filter(e => {
          const eventDate = new Date(e.date);
          const diffMins = Math.abs((eventDate - tradeDate) / 60000);
          return diffMins <= 120; // Show events within 2 hours
        });

        if (nearbyEvents.length === 0) {
          container.style.display = "none";
          return;
        }

        let html = '<div style="background: rgba(245, 158, 11, 0.05); border: 1px solid var(--warning); border-radius: 8px; padding: 12px;">';
        html += '<div style="font-weight: bold; color: var(--warning); margin-bottom: 8px; display: flex; align-items: center; gap: 6px;"><i data-lucide="alert-triangle" style="width: 16px; height: 16px;"></i> Nearby Economic Events (±2 hours)</div>';
        html += '<div style="display: flex; flex-direction: column; gap: 8px;">';
        
        nearbyEvents.forEach(e => {
          const eventDate = new Date(e.date);
          const timeString = eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const impactColor = e.impact === 'High' ? 'var(--danger)' : 'var(--warning)';
          
          html += `
            <div style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem;">
              <span style="background: ${impactColor}; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 0.7rem;">${e.country}</span>
              <span style="color: var(--muted);">${timeString}</span>
              <strong>${e.title}</strong>
            </div>
          `;
        });
        
        html += '</div></div>';
        container.innerHTML = html;
        container.style.display = "block";
        lucide.createIcons({ root: container });
      };

      // --- Trading Plan Logic ---
      window.updateTradingPlanView = function () {
        const dateInput = document.getElementById("plan-date");
        if (!dateInput.value) {
          dateInput.value = new Date().toISOString().split("T")[0];
        }
        const date = dateInput.value;
        const accountId = document.getElementById("plan-account").value;
        const planType = document.getElementById("plan-type").value;

        document.getElementById("plan-title-left").innerText =
          `Pre-${planType} Plan`;
        document.getElementById("plan-title-right").innerText =
          `End-of-${planType} Summary`;

        const key = `${planType}_${date}_${accountId}`;
        const data = Store.planner[key] || {
          bias: "Neutral",
          numTrades: "",
          session: "All",
          notes: "",
          screenshot: "",
          mistakes: "",
          emotion: "Neutral",
          grade: "C",
        };

        document.getElementById("plan-bias").value = data.bias || "Neutral";
        document.getElementById("plan-num-trades").value = data.numTrades || "";
        document.getElementById("plan-session").value = data.session || "All";
        document.getElementById("plan-notes").value = data.notes || "";
        document.getElementById("plan-screenshot").value =
          data.screenshot || "";
        document.getElementById("eod-mistakes").value = data.mistakes || "";
        document.getElementById("eod-emotion").value =
          data.emotion || "Neutral";
        document.getElementById("eod-grade").value = data.grade || "C";

        const preview = document.getElementById("plan-screenshot-preview");
        const img = document.getElementById("plan-screenshot-img");
        if (data.screenshot) {
          img.src = data.screenshot;
          preview.style.display = "block";
        } else {
          preview.style.display = "none";
        }

        // Calculate EOD stats
        let relevantTrades = Store.trades;
        if (accountId !== "all") {
          relevantTrades = relevantTrades.filter(
            (t) => t.accountId == accountId,
          );
        }

        if (planType === "Daily") {
          relevantTrades = relevantTrades.filter((t) => t.date === date);
        } else if (planType === "Weekly") {
          // Simplified weekly check (just checking if same week is complex without moment.js, using simple date check for now)
          // In a real app, use proper date math
          const selectedDate = new Date(date);
          const startOfWeek = new Date(
            selectedDate.setDate(
              selectedDate.getDate() - selectedDate.getDay(),
            ),
          );
          const endOfWeek = new Date(
            selectedDate.setDate(
              selectedDate.getDate() - selectedDate.getDay() + 6,
            ),
          );
          relevantTrades = relevantTrades.filter((t) => {
            const d = new Date(t.date);
            return d >= startOfWeek && d <= endOfWeek;
          });
        } else if (planType === "Monthly") {
          const monthPrefix = date.substring(0, 7);
          relevantTrades = relevantTrades.filter((t) =>
            t.date.startsWith(monthPrefix),
          );
        }

        const pnl = relevantTrades.reduce((sum, t) => sum + t.r, 0);
        document.getElementById("eod-pnl").innerText =
          `${pnl > 0 ? "+" : ""}${pnl.toFixed(2)}R`;
        document.getElementById("eod-pnl").style.color =
          pnl >= 0 ? "var(--success)" : "var(--danger)";
        document.getElementById("eod-trades").innerText = relevantTrades.length;
      };

      window.saveTradingPlanData = function () {
        const date = document.getElementById("plan-date").value;
        const accountId = document.getElementById("plan-account").value;
        const planType = document.getElementById("plan-type").value;
        const key = `${planType}_${date}_${accountId}`;

        const screenshotUrl = document.getElementById("plan-screenshot").value;

        Store.planner[key] = {
          bias: document.getElementById("plan-bias").value,
          numTrades: document.getElementById("plan-num-trades").value,
          session: document.getElementById("plan-session").value,
          notes: document.getElementById("plan-notes").value,
          screenshot: screenshotUrl,
          mistakes: document.getElementById("eod-mistakes").value,
          emotion: document.getElementById("eod-emotion").value,
          grade: document.getElementById("eod-grade").value,
        };

        const preview = document.getElementById("plan-screenshot-preview");
        const img = document.getElementById("plan-screenshot-img");
        if (screenshotUrl) {
          img.src = screenshotUrl;
          preview.style.display = "block";
        } else {
          preview.style.display = "none";
        }

        Store.save();
      };

      // --- Performance Metrics Logic ---
      window.updatePerformanceMetrics = function () {
        const filterAcc = document.getElementById("metrics-account-filter");
        if (!filterAcc) return;
        const accId = filterAcc.value;

        let filteredTrades = Store.trades;
        if (accId !== "all") {
          filteredTrades = Store.trades.filter((t) => t.accountId == accId);
        }

        const totalTrades = filteredTrades.length;
        const winningTrades = filteredTrades.filter((t) => t.r > 0);
        const losingTrades = filteredTrades.filter((t) => t.r < 0);

        const winRate =
          totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;

        const grossProfit = winningTrades.reduce((sum, t) => sum + t.r, 0);
        const grossLoss = Math.abs(
          losingTrades.reduce((sum, t) => sum + t.r, 0),
        );
        const profitFactor =
          grossLoss > 0
            ? grossProfit / grossLoss
            : grossProfit > 0
              ? grossProfit
              : 0;

        const avgWin =
          winningTrades.length > 0 ? grossProfit / winningTrades.length : 0;
        const avgLoss =
          losingTrades.length > 0 ? grossLoss / losingTrades.length : 0;
        const avgRR = avgLoss > 0 ? avgWin / avgLoss : 0;

        const expectancy =
          (winRate / 100) * avgWin - (1 - winRate / 100) * avgLoss;

        // Calculate Sharpe Ratio (simplified, assuming risk-free rate = 0 and daily returns)
        let sharpe = 0;
        if (totalTrades > 1) {
          const returns = filteredTrades.map((t) => t.r);
          const meanReturn =
            returns.reduce((sum, r) => sum + r, 0) / totalTrades;
          const variance =
            returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) /
            (totalTrades - 1);
          const stdDev = Math.sqrt(variance);
          sharpe = stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(252) : 0; // Annualized
        }

        document.getElementById("metric-win-rate").innerText =
          `${winRate.toFixed(2)}%`;
        document.getElementById("metric-profit-factor").innerText =
          profitFactor.toFixed(2);
        document.getElementById("metric-sharpe").innerText = sharpe.toFixed(2);
        document.getElementById("metric-expectancy").innerText =
          `${expectancy.toFixed(2)}R`;
        document.getElementById("metric-rr").innerText = avgRR.toFixed(2);
        document.getElementById("metric-avg-win").innerText =
          `${avgWin.toFixed(2)}R`;
        document.getElementById("metric-avg-loss").innerText =
          `${avgLoss.toFixed(2)}R`;
        document.getElementById("metric-total-trades").innerText = totalTrades;

        // Monthly Chart
        const ctx = document.getElementById("metricsMonthlyChart");
        if (!ctx) return;
        if (window.metricsMonthlyChartObj)
          window.metricsMonthlyChartObj.destroy();

        const monthlyData = {};
        filteredTrades.forEach((t) => {
          if (!t.date) return;
          const dateObj = new Date(t.date);
          const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}`;
          monthlyData[monthKey] = (monthlyData[monthKey] || 0) + t.r;
        });

        const sortedMonths = Object.keys(monthlyData).sort();
        const monthlyValues = sortedMonths.map((m) => monthlyData[m]);
        const backgroundColors = monthlyValues.map((v) =>
          v >= 0 ? "#10b981" : "#ef4444",
        );

        window.metricsMonthlyChartObj = new Chart(ctx, {
          type: "bar",
          data: {
            labels: sortedMonths,
            datasets: [
              {
                label: "Monthly R",
                data: monthlyValues,
                backgroundColor: backgroundColors,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: { grid: { color: "rgba(255,255,255,0.05)" } },
              x: { grid: { display: false } },
            },
            plugins: { legend: { display: false } },
          },
        });

        // Radar Chart
        const ctxRadar = document.getElementById("metricsRadarChart");
        if (ctxRadar) {
          if (window.metricsRadarChartObj)
            window.metricsRadarChartObj.destroy();

          // Normalize metrics for radar chart (0-100 scale ideally)
          const normWinRate = winRate;
          const normPF = Math.min(profitFactor * 20, 100); // 5.0 PF = 100
          const normRR = Math.min(avgRR * 20, 100); // 5.0 RR = 100
          const normExpectancy = Math.min(
            Math.max(expectancy * 50 + 50, 0),
            100,
          ); // -1 to 1 mapped to 0-100

          // Calculate Trade Quality (based on grade)
          const gradeScores = { "A+": 100, A: 80, B: 60, C: 40 };
          const totalGradeScore = filteredTrades.reduce(
            (sum, t) => sum + (gradeScores[t.grade] || 50),
            0,
          );
          const avgQuality =
            totalTrades > 0 ? totalGradeScore / totalTrades : 0;

          window.metricsRadarChartObj = new Chart(ctxRadar, {
            type: "radar",
            data: {
              labels: [
                "Win Rate",
                "Profit Factor",
                "Risk:Reward",
                "Expectancy",
                "Trade Quality",
              ],
              datasets: [
                {
                  label: "Performance Profile",
                  data: [
                    normWinRate,
                    normPF,
                    normRR,
                    normExpectancy,
                    avgQuality,
                  ],
                  backgroundColor: "rgba(59, 130, 246, 0.2)",
                  borderColor: "rgba(59, 130, 246, 1)",
                  pointBackgroundColor: "rgba(59, 130, 246, 1)",
                  pointBorderColor: "#fff",
                  pointHoverBackgroundColor: "#fff",
                  pointHoverBorderColor: "rgba(59, 130, 246, 1)",
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                r: {
                  angleLines: { color: "rgba(255,255,255,0.1)" },
                  grid: { color: "rgba(255,255,255,0.1)" },
                  pointLabels: { color: "var(--muted)", font: { size: 12 } },
                  ticks: { display: false, min: 0, max: 100 },
                },
              },
              plugins: { legend: { display: false } },
            },
          });
        }

        // Scatter Chart (R:R vs Win Rate by Model)
        const ctxScatter = document.getElementById("metricsScatterChart");
        if (ctxScatter) {
          if (window.metricsScatterChartObj)
            window.metricsScatterChartObj.destroy();

          const modelStats = {};
          filteredTrades.forEach((t) => {
            if (!modelStats[t.model]) {
              modelStats[t.model] = {
                trades: 0,
                wins: 0,
                grossProfit: 0,
                grossLoss: 0,
              };
            }
            modelStats[t.model].trades++;
            if (t.r > 0) {
              modelStats[t.model].wins++;
              modelStats[t.model].grossProfit += t.r;
            } else if (t.r < 0) {
              modelStats[t.model].grossLoss += Math.abs(t.r);
            }
          });

          const scatterData = Object.keys(modelStats).map((model) => {
            const stats = modelStats[model];
            const wr = (stats.wins / stats.trades) * 100;
            const aw = stats.wins > 0 ? stats.grossProfit / stats.wins : 0;
            const al =
              stats.trades - stats.wins > 0
                ? stats.grossLoss / (stats.trades - stats.wins)
                : 0;
            const rr = al > 0 ? aw / al : 0;
            return {
              x: rr,
              y: wr,
              r: Math.max(stats.trades * 2, 5),
              model: model,
            }; // r is bubble radius
          });

          window.metricsScatterChartObj = new Chart(ctxScatter, {
            type: "bubble",
            data: {
              datasets: [
                {
                  label: "Models",
                  data: scatterData,
                  backgroundColor: "rgba(16, 185, 129, 0.5)",
                  borderColor: "rgba(16, 185, 129, 1)",
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                x: {
                  title: {
                    display: true,
                    text: "Average Risk:Reward",
                    color: "var(--muted)",
                  },
                  grid: { color: "rgba(255,255,255,0.05)" },
                },
                y: {
                  title: {
                    display: true,
                    text: "Win Rate (%)",
                    color: "var(--muted)",
                  },
                  grid: { color: "rgba(255,255,255,0.05)" },
                  min: 0,
                  max: 100,
                },
              },
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: function (context) {
                      const d = context.raw;
                      return `${d.model}: WR ${d.y.toFixed(1)}%, R:R ${d.x.toFixed(2)}`;
                    },
                  },
                },
              },
            },
          });
        }
      };

      // --- Trade Journal Logic ---
      window.togglePartials = function () {
        const el = document.getElementById("partials-calculator");
        el.style.display = el.style.display === "none" ? "block" : "none";
      };

      window.addPartialRow = function () {
        const list = document.getElementById("partials-list");
        const row = document.createElement("div");
        row.className = "partial-row";
        row.style.cssText = "display: flex; gap: 8px; margin-bottom: 8px;";
        row.innerHTML = `
                <input type="number" placeholder="Exit R" class="partial-r" style="flex: 1; padding: 6px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg); color: var(--text);">
                <input type="number" placeholder="Size %" class="partial-size" style="flex: 1; padding: 6px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg); color: var(--text);">
            `;
        list.appendChild(row);
      };

      window.calculateWeightedR = function () {
        const rows = document.querySelectorAll(".partial-row");
        let totalR = 0;
        let totalSize = 0;

        rows.forEach((row) => {
          const r = parseFloat(row.querySelector(".partial-r").value);
          const size = parseFloat(row.querySelector(".partial-size").value);
          if (!isNaN(r) && !isNaN(size)) {
            totalR += r * (size / 100);
            totalSize += size;
          }
        });

        if (totalSize > 100) {
          alert("Total size % cannot exceed 100%.");
          return;
        }

        document.getElementById("trade-r").value = totalR.toFixed(2);
        togglePartials();
      };

      window.saveTrade = function () {
        const accountId = document.getElementById("trade-account").value;
        const asset = document.getElementById("trade-asset").value;
        const date = document.getElementById("trade-date").value;
        const rMult = parseFloat(document.getElementById("trade-r").value);

        if (!asset || !date || isNaN(rMult)) {
          alert("Please fill in Asset, Date, and R-Multiple.");
          return;
        }

        const entryTime = document.getElementById("trade-entry-time").value;
        const exitTime = document.getElementById("trade-exit-time").value;
        let duration = "-";
        if (entryTime && exitTime) {
          const [eh, em] = entryTime.split(":").map(Number);
          const [xh, xm] = exitTime.split(":").map(Number);
          let diffMins = xh * 60 + xm - (eh * 60 + em);
          if (diffMins < 0) diffMins += 24 * 60; // crossed midnight
          const h = Math.floor(diffMins / 60);
          const m = diffMins % 60;
          duration = `${h}h ${m}m`;
        }

        let isNewsTrade = false;
        if (date && entryTime && window.todayEconomicEvents) {
          const tradeDate = new Date(`${date}T${entryTime}`);
          if (!isNaN(tradeDate.getTime())) {
            const nearbyHighImpact = window.todayEconomicEvents.some(e => {
              if (e.impact !== 'High') return false;
              const eventDate = new Date(e.date);
              const diffMins = Math.abs((eventDate - tradeDate) / 60000);
              return diffMins <= 60; // Within 60 mins of high impact news
            });
            isNewsTrade = nearbyHighImpact;
          }
        }

        const newTrade = {
          id: Date.now(),
          accountId: accountId,
          asset,
          date,
          entryTime,
          exitTime,
          duration,
          isNewsTrade,
          session: document.getElementById("trade-session").value,
          model: document.getElementById("trade-model").value || "Unknown",
          grade: document.getElementById("trade-grade").value,
          plannedR:
            parseFloat(document.getElementById("trade-planned-r").value) || 0,
          r: rMult,
          commission:
            parseFloat(document.getElementById("trade-commission").value) || 0,
          slippage:
            parseFloat(document.getElementById("trade-slippage").value) || 0,
          mae: parseFloat(document.getElementById("trade-mae").value) || 0,
          mfe: parseFloat(document.getElementById("trade-mfe").value) || 0,
          mistake: document.getElementById("trade-mistake").value,
          preEmotion: document.getElementById("trade-pre-emotion").value,
          postEmotion: document.getElementById("trade-post-emotion").value,
          psychScore:
            parseInt(document.getElementById("trade-psych-score").value) || 10,
          tags: document
            .getElementById("trade-tags")
            .value.split(",")
            .map((t) => t.trim())
            .filter((t) => t),
          screenshot: document.getElementById("trade-screenshot").value,
          preNotes: document.getElementById("trade-pre-notes").value,
          postNotes: document.getElementById("trade-post-notes").value,
        };

        Store.trades.unshift(newTrade);
        Store.save();
        
        if (window.SyncEngine && window.SyncEngine.isSyncing) {
            window.SyncEngine.syncTrade(newTrade);
        }

        // TRIGGER ALERTS via NotificationEngine
        if (window.NotificationEngine) {
            window.NotificationEngine.dispatchTradeLogged(newTrade);
            // After saving, calculate daily loss and evaluate new high/streak
            setTimeout(() => window.evaluateRealTimeAlerts(newTrade), 500); 
        }

        closeModal();
        renderAll();
      };

      window.viewTrade = function (id) {
        const trade = Store.trades.find((t) => t.id === id);
        if (!trade) return;

        const content = document.getElementById("view-trade-content");
        if (!content) return;

        let screenshotHtml = '';
        if (trade.screenshot) {
          screenshotHtml = `
            <div style="margin-top: 16px;">
              <h3 style="font-size: 1rem; margin-bottom: 8px;">Screenshot</h3>
              <a href="${trade.screenshot}" target="_blank">
                <img src="${trade.screenshot}" alt="Trade Screenshot" style="max-width: 100%; border-radius: 8px; border: 1px solid var(--border);" />
              </a>
            </div>
          `;
        }

        content.innerHTML = `
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
            <div>
              <p style="margin: 0; color: var(--muted); font-size: 0.85rem;">Asset</p>
              <p style="margin: 4px 0 0 0; font-weight: 600; font-size: 1.1rem;">${trade.asset}</p>
            </div>
            <div>
              <p style="margin: 0; color: var(--muted); font-size: 0.85rem;">Date</p>
              <p style="margin: 4px 0 0 0; font-weight: 600; font-size: 1.1rem;">${trade.date}</p>
            </div>
            <div>
              <p style="margin: 0; color: var(--muted); font-size: 0.85rem;">Session</p>
              <p style="margin: 4px 0 0 0;">${trade.session}</p>
            </div>
            <div>
              <p style="margin: 0; color: var(--muted); font-size: 0.85rem;">Type</p>
              <p style="margin: 4px 0 0 0;">${trade.type}</p>
            </div>
            <div>
              <p style="margin: 0; color: var(--muted); font-size: 0.85rem;">Setup</p>
              <p style="margin: 4px 0 0 0;">${trade.model}</p>
            </div>
            <div>
              <p style="margin: 0; color: var(--muted); font-size: 0.85rem;">Grade</p>
              <p style="margin: 4px 0 0 0;"><span class="risk-badge" style="background: ${trade.grade === "A+" ? "var(--success)" : trade.grade === "A" ? "var(--primary)" : "var(--border)"}">${trade.grade}</span></p>
            </div>
            <div>
              <p style="margin: 0; color: var(--muted); font-size: 0.85rem;">Duration</p>
              <p style="margin: 4px 0 0 0;">${trade.duration || "-"}</p>
            </div>
            <div>
              <p style="margin: 0; color: var(--muted); font-size: 0.85rem;">News Trade</p>
              <p style="margin: 4px 0 0 0;">${trade.isNewsTrade ? "Yes" : "No"}</p>
            </div>
            <div>
              <p style="margin: 0; color: var(--muted); font-size: 0.85rem;">Planned R</p>
              <p style="margin: 4px 0 0 0; font-family: var(--font-mono);">${trade.plannedR ? trade.plannedR.toFixed(2) + "R" : "-"}</p>
            </div>
            <div>
              <p style="margin: 0; color: var(--muted); font-size: 0.85rem;">Actual R</p>
              <p style="margin: 4px 0 0 0; font-family: var(--font-mono); color: ${trade.r >= 0 ? "var(--success)" : "var(--danger)"}">${trade.r > 0 ? "+" : ""}${trade.r.toFixed(2)}R</p>
            </div>
            <div>
              <p style="margin: 0; color: var(--muted); font-size: 0.85rem;">Fees/Slippage</p>
              <p style="margin: 4px 0 0 0; color: var(--danger);">$${(trade.commission || 0).toFixed(2)} / ${trade.slippage || 0}</p>
            </div>
            <div>
              <p style="margin: 0; color: var(--muted); font-size: 0.85rem;">Mistake</p>
              <p style="margin: 4px 0 0 0; color: ${trade.mistake !== "None" && trade.mistake ? "var(--danger)" : "var(--text)"}">${trade.mistake || "None"}</p>
            </div>
            <div>
              <p style="margin: 0; color: var(--muted); font-size: 0.85rem;">Pre-Emotion</p>
              <p style="margin: 4px 0 0 0;">${trade.preEmotion || "-"}</p>
            </div>
            <div>
              <p style="margin: 0; color: var(--muted); font-size: 0.85rem;">Post-Emotion</p>
              <p style="margin: 4px 0 0 0;">${trade.postEmotion || "-"}</p>
            </div>
            <div style="grid-column: span 2;">
              <p style="margin: 0; color: var(--muted); font-size: 0.85rem;">Tags</p>
              <p style="margin: 4px 0 0 0;">${trade.tags ? trade.tags.map((tag) => `<span class="risk-badge" style="background: var(--surface); border: 1px solid var(--border); margin-right: 4px;">${tag}</span>`).join("") : "-"}</p>
            </div>
            <div style="grid-column: span 2;">
              <p style="margin: 0; color: var(--muted); font-size: 0.85rem;">Notes</p>
              <p style="margin: 4px 0 0 0; white-space: pre-wrap;">${trade.notes || "-"}</p>
            </div>
          </div>
          ${screenshotHtml}
        `;

        openModal("modal-view-trade");
      };

      window.deleteTrade = function (id) {
        if (confirm("Delete this trade?")) {
          const trade = Store.trades.find((t) => t.id === id);
          const screenshotUrl = trade ? trade.screenshot : null;
          
          if (trade && trade.accountId && trade.accountId !== "all" && trade.pnlAmount) {
            const account = Store.accounts.find(a => a.id == trade.accountId);
            if (account) {
              account.balance -= trade.pnlAmount;
              account.equity -= trade.pnlAmount;
            }
          }

          Store.trades = Store.trades.filter((t) => t.id !== id);
          Store.save();
          
          if (window.SyncEngine && window.SyncEngine.isSyncing) {
              window.SyncEngine.deleteTrade(id, screenshotUrl);
          }
          
          renderAll();
        }
      };

      let currentCalendarDate = new Date();

      window.changeCalendarMonth = function (delta) {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
        renderTradeCalendar();
      };

      let currentCalendarTab = "rr";

      window.setCalendarTab = function (tab) {
        currentCalendarTab = tab;
        document.getElementById("cal-tab-rr").style.background =
          tab === "rr" ? "var(--primary)" : "transparent";
        document.getElementById("cal-tab-rr").style.color =
          tab === "rr" ? "white" : "var(--muted)";
        document.getElementById("cal-tab-port").style.background =
          tab === "port" ? "var(--primary)" : "transparent";
        document.getElementById("cal-tab-port").style.color =
          tab === "port" ? "white" : "var(--muted)";
        document.getElementById("cal-tab-plan").style.background =
          tab === "plan" ? "var(--primary)" : "transparent";
        document.getElementById("cal-tab-plan").style.color =
          tab === "plan" ? "white" : "var(--muted)";
        renderTradeCalendar();
      };

      window.renderTradeCalendar = function () {
        const container = document.getElementById("trade-calendar");
        const label = document.getElementById("calendar-month-label");
        if (!container || !label) return;

        const year = currentCalendarDate.getFullYear();
        const month = currentCalendarDate.getMonth();

        label.innerText = currentCalendarDate.toLocaleString("default", {
          month: "long",
          year: "numeric",
        });

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // Aggregate data
        const dayMap = {};
        const portMap = {};

        Store.trades.forEach((t) => {
          const tDate = new Date(t.date);
          if (tDate.getFullYear() === year && tDate.getMonth() === month) {
            const day = tDate.getDate();
            dayMap[day] = (dayMap[day] || 0) + t.r;
          }
        });

        Store.transactions.forEach((c) => {
          const cDate = new Date(c.date);
          if (cDate.getFullYear() === year && cDate.getMonth() === month) {
            const day = cDate.getDate();
            portMap[day] =
              (portMap[day] || 0) +
              (c.type === "Deposit" ? c.amount : -c.amount);
          }
        });

        let html = `
                <div style="text-align: center; color: var(--muted); font-size: 0.75rem;">Sun</div>
                <div style="text-align: center; color: var(--muted); font-size: 0.75rem;">Mon</div>
                <div style="text-align: center; color: var(--muted); font-size: 0.75rem;">Tue</div>
                <div style="text-align: center; color: var(--muted); font-size: 0.75rem;">Wed</div>
                <div style="text-align: center; color: var(--muted); font-size: 0.75rem;">Thu</div>
                <div style="text-align: center; color: var(--muted); font-size: 0.75rem;">Fri</div>
                <div style="text-align: center; color: var(--muted); font-size: 0.75rem;">Sat</div>
            `;

        for (let i = 0; i < firstDay; i++) {
          html += `<div></div>`;
        }

        for (let i = 1; i <= daysInMonth; i++) {
          let bg = "var(--surface)";
          let color = "var(--text)";
          let content = "";

          if (currentCalendarTab === "rr") {
            const r = dayMap[i];
            if (r !== undefined) {
              if (r > 0) {
                bg = "rgba(16, 185, 129, 0.2)";
                color = "var(--success)";
              } else if (r < 0) {
                bg = "rgba(244, 63, 94, 0.2)";
                color = "var(--danger)";
              } else {
                bg = "rgba(255, 255, 255, 0.1)";
              }
              content = `<span style="font-family: var(--font-mono); font-size: 0.875rem; font-weight: 600; color: ${color}; text-align: right;">${r > 0 ? "+" : ""}${r.toFixed(1)}R</span>`;
            }
          } else if (currentCalendarTab === "port") {
            const p = portMap[i];
            if (p !== undefined) {
              if (p > 0) {
                bg = "rgba(16, 185, 129, 0.2)";
                color = "var(--success)";
              } else if (p < 0) {
                bg = "rgba(244, 63, 94, 0.2)";
                color = "var(--danger)";
              } else {
                bg = "rgba(255, 255, 255, 0.1)";
              }
              content = `<span style="font-family: var(--font-mono); font-size: 0.875rem; font-weight: 600; color: ${color}; text-align: right;">${p > 0 ? "+" : ""}$${Math.abs(p).toFixed(0)}</span>`;
            }
          } else if (currentCalendarTab === "plan") {
            // Just a placeholder for daily plans
            content = `<span style="font-size: 0.7rem; color: var(--muted); text-align: right; cursor: pointer;">+ Plan</span>`;
          }

          html += `
                    <div style="background: ${bg}; border-radius: 4px; padding: 8px; min-height: 60px; display: flex; flex-direction: column; justify-content: space-between;">
                        <span style="font-size: 0.75rem; color: var(--muted);">${i}</span>
                        ${content}
                    </div>
                `;
        }

        container.innerHTML = html;
      };

      window.renderTradeTable = function () {
        const assetFilter = document.getElementById("filter-asset").value;
        const sessionFilter = document.getElementById("filter-session").value;

        const filteredTrades = Store.trades.filter((t) => {
          const assetMatch = assetFilter === "All" || t.asset === assetFilter;
          const sessionMatch =
            sessionFilter === "All" || t.session === sessionFilter;
          return assetMatch && sessionMatch;
        });

        renderTable(
          "trades-table-body",
          filteredTrades,
          (t) => `
                <tr>
                    <td>${t.date}</td>
                    <td style="font-weight: 600;">${t.asset}</td>
                    <td>${t.session}</td>
                    <td>${t.model}</td>
                    <td><span class="risk-badge" style="background: ${t.grade === "A+" ? "var(--success)" : t.grade === "A" ? "var(--primary)" : "var(--border)"}">${t.grade}</span></td>
                    <td style="color: var(--muted); font-size: 0.85rem;">${t.duration || "-"}</td>
                    <td>${t.isNewsTrade ? '<span class="risk-badge" style="background: rgba(239, 68, 68, 0.1); color: var(--danger); border: 1px solid var(--danger);"><i data-lucide="alert-triangle" style="width: 12px; height: 12px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>News</span>' : '-'}</td>
                    <td class="font-mono" style="color: var(--muted)">${t.plannedR ? t.plannedR.toFixed(2) + "R" : "-"}</td>
                    <td class="font-mono" style="color: ${t.r >= 0 ? "var(--success)" : "var(--danger)"}">${t.r > 0 ? "+" : ""}${t.r.toFixed(2)}R</td>
                    <td style="color: var(--danger); font-size: 0.85rem;">$${(t.commission || 0).toFixed(2)} / ${t.slippage || 0}</td>
                    <td><span style="color: ${t.mistake !== "None" && t.mistake ? "var(--danger)" : "var(--muted)"}">${t.mistake || "None"}</span></td>
                    <td>${t.preEmotion || "-"}</td>
                    <td>${t.postEmotion || "-"}</td>
                    <td>${t.tags ? t.tags.map((tag) => `<span class="risk-badge" style="background: var(--surface); border: 1px solid var(--border); margin-right: 4px;">${tag}</span>`).join("") : "-"}</td>
                    <td>
                        <button class="icon-btn" onclick="viewTrade(${t.id})" title="View Trade Details" style="margin-right: 8px;">
                            <i data-lucide="eye" style="color: var(--primary); width: 16px; height: 16px;"></i>
                        </button>
                        <button class="icon-btn" onclick="deleteTrade(${t.id})" title="Delete Trade">
                            <i data-lucide="trash-2" style="color: var(--danger); width: 16px; height: 16px;"></i>
                        </button>
                    </td>
                </tr>
            `,
        );
        lucide.createIcons();
      };

      window.saveBacktest = function () {
        const name = document.getElementById("bt-name").value;
        const winrate = parseFloat(document.getElementById("bt-winrate").value);
        const pf = parseFloat(document.getElementById("bt-pf").value);
        const dd = parseFloat(document.getElementById("bt-dd").value);
        const sample = parseInt(document.getElementById("bt-sample").value);

        if (!name || isNaN(winrate) || isNaN(pf)) {
          alert("Please fill in Name, Win Rate, and Profit Factor.");
          return;
        }

        Store.backtests.unshift({
          id: Date.now(),
          name,
          winrate,
          pf,
          dd,
          sample,
        });

        Store.save();
        closeModal();
        renderAll();
      };

      window.deleteBacktest = function (id) {
        if (confirm("Delete this backtest?")) {
          Store.backtests = Store.backtests.filter((b) => b.id !== id);
          Store.save();
          renderAll();
        }
      };

      // --- Payout Logic ---
      window.savePayout = function () {
        const accountId = document.getElementById("payout-account").value;
        const date = document.getElementById("payout-date").value;
        const amount = parseFloat(
          document.getElementById("payout-amount").value,
        );

        if (!accountId || !date || isNaN(amount)) {
          alert("Please fill in all fields correctly.");
          return;
        }

        const account = Store.accounts.find((a) => a.id == accountId);
        if (!account) return;

        // Deduct from account balance and equity
        account.balance = (account.balance || 0) - amount;
        account.equity = (account.equity || 0) - amount;

        const payout = {
          id: Date.now(),
          accountId: account.id,
          accountName: account.name,
          firm: account.firm,
          date: date,
          amount: amount,
        };

        Store.payouts.unshift(payout);
        Store.save();
        closeModal();
        renderAll();
      };

      window.openUpdateBalanceModal = function (id) {
        const account = Store.accounts.find((a) => a.id == id);
        if (!account) return;
        document.getElementById("update-bal-account-id").value = id;
        document.getElementById("update-bal-amount").value =
          account.balance || 0;
        document.getElementById("update-eq-amount").value = account.equity || 0;
        openModal("modal-update-balance");
      };

      window.saveBalanceUpdate = function () {
        const id = document.getElementById("update-bal-account-id").value;
        const bal = parseFloat(
          document.getElementById("update-bal-amount").value,
        );
        let eq = parseFloat(document.getElementById("update-eq-amount").value);

        if (isNaN(eq)) eq = bal;

        if (isNaN(bal)) {
          alert("Please provide a valid balance.");
          return;
        }

        const account = Store.accounts.find((a) => a.id == id);
        if (account) {
          account.balance = bal;
          account.equity = eq;

          // Migrate old history format if needed
          if (!account.history) account.history = [];
          if (
            account.history.length > 0 &&
            typeof account.history[0] === "number"
          ) {
            account.history = account.history.map((val, i) => ({
              date: new Date(
                Date.now() - (account.history.length - i) * 86400000,
              )
                .toISOString()
                .split("T")[0],
              balance: val,
              equity: val,
            }));
          }

          const date = new Date().toISOString().split("T")[0];
          account.history.push({ date, balance: bal, equity: eq });

          Store.save();
          closeModal();
          renderAll();
        }
      };

      window.deletePayout = function (id) {
        if (confirm("Are you sure you want to delete this payout record?")) {
          Store.payouts = Store.payouts.filter((p) => p.id !== id);
          Store.save();
          renderAll();
        }
      };

      // --- Investment Logic ---
      window.saveInvestment = function () {
        const asset = document.getElementById("inv-asset").value.toUpperCase();
        const amount = parseFloat(document.getElementById("inv-amount").value);
        const entry = parseFloat(document.getElementById("inv-entry").value);

        if (!asset || isNaN(amount) || isNaN(entry)) {
          alert("Please fill in all fields correctly.");
          return;
        }

        const inv = {
          id: Date.now(),
          asset: asset,
          amount: amount,
          entryPrice: entry,
        };

        Store.investments.push(inv);
        Store.save();
        closeModal();

        document.getElementById("inv-asset").value = "";
        document.getElementById("inv-amount").value = "";
        document.getElementById("inv-entry").value = "";

        if (typeof renderInvestments === "function") renderInvestments();
      };

      window.deleteInvestment = function (id) {
        if (confirm("Remove this investment?")) {
          Store.investments = Store.investments.filter((i) => i.id !== id);
          Store.save();
          if (typeof renderInvestments === "function") renderInvestments();
        }
      };

      window.renderInvestments = function () {
        const tbody = document.getElementById("investments-table-body");
        if (!tbody) return;

        if (Store.investments.length === 0) {
          tbody.innerHTML =
            '<tr><td colspan="7" style="text-align: center; color: var(--muted);">No investments tracked yet.</td></tr>';
          return;
        }

        let html = "";
        Store.investments.forEach((inv) => {
          const livePrice =
            window.livePrices && window.livePrices[inv.asset]
              ? window.livePrices[inv.asset]
              : inv.entryPrice;
          const currentValue = inv.amount * livePrice;
          const investedValue = inv.amount * inv.entryPrice;
          const pnl = currentValue - investedValue;
          const pnlPct = (pnl / investedValue) * 100;

          const color = pnl >= 0 ? "var(--success)" : "var(--danger)";
          const sign = pnl >= 0 ? "+" : "";

          html += `
                    <tr>
                        <td style="font-weight: 600;">${inv.asset}</td>
                        <td>${inv.amount}</td>
                        <td>$${inv.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td>$${livePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td style="font-weight: 600;">$${currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td style="color: ${color}; font-weight: 600;">${sign}$${pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${sign}${pnlPct.toFixed(2)}%)</td>
                        <td>
                            <button class="icon-btn" onclick="deleteInvestment(${inv.id})" title="Remove"><i data-lucide="trash-2" style="width: 16px; height: 16px; color: var(--danger);"></i></button>
                        </td>
                    </tr>
                `;
        });
        tbody.innerHTML = html;
        lucide.createIcons();
      };

      // --- Wishlist Logic ---
      window.saveWishlistItem = function () {
        const item = {
          id: Date.now(),
          name: document.getElementById("wish-name").value,
          category: document.getElementById("wish-category").value,
          amount: parseFloat(document.getElementById("wish-amount").value) || 0,
          notes: document.getElementById("wish-notes").value,
          status: "Pending",
          dateAdded: new Date().toLocaleDateString(),
        };

        if (!item.name) {
          alert("Please enter an item name.");
          return;
        }

        Store.wishlist.push(item);
        Store.save();
        closeModal();

        // Clear inputs
        document.getElementById("wish-name").value = "";
        document.getElementById("wish-amount").value = "";
        document.getElementById("wish-notes").value = "";
      };

      window.deleteWishlistItem = function (id) {
        if (confirm("Remove this item from your wishlist?")) {
          Store.wishlist = Store.wishlist.filter((i) => i.id !== id);
          Store.save();
        }
      };

      window.toggleWishlistStatus = function (id) {
        const item = Store.wishlist.find((i) => i.id === id);
        if (item) {
          item.status = item.status === "Pending" ? "Completed" : "Pending";
          Store.save();
        }
      };

      // --- Allocation Logic ---
      window.updateCustomAllocation = function () {
        const lifestyle =
          parseFloat(document.getElementById("alloc-lifestyle").value) || 0;
        const emergency =
          parseFloat(document.getElementById("alloc-emergency").value) || 0;
        const recap =
          parseFloat(document.getElementById("alloc-recap").value) || 0;
        const investment =
          parseFloat(document.getElementById("alloc-investment").value) || 0;

        const splits = { lifestyle, emergency, recap, investment };
        renderAllocationVaR(splits);
      };

      window.updateAllocPreview = function () {
        const amount =
          parseFloat(document.getElementById("alloc-amount").value) || 0;
        const phase = parseInt(document.getElementById("alloc-phase").value);
        const config = Store.settings.phases[phase];

        const withdrawal = amount * config.withdrawal;
        const recap = amount - withdrawal;

        const splits = {
          lifestyle: withdrawal * config.split.lifestyle,
          emergency: withdrawal * config.split.emergency,
          recap: withdrawal * config.split.recap + recap,
          investment: withdrawal * config.split.investment,
        };

        const container = document.getElementById("alloc-preview");
        container.innerHTML = `
                <div class="bucket">
                    <div class="bucket-val">$${(withdrawal || 0).toLocaleString()}</div>
                    <div class="bucket-name">Total Withdrawal (${config.withdrawal * 100}%)</div>
                </div>
                <div class="bucket">
                    <div class="bucket-val" style="display: flex; align-items: center; justify-content: center;">
                        <span style="color: var(--muted); margin-right: 4px;">$</span>
                        <input type="number" id="alloc-lifestyle" value="${splits.lifestyle.toFixed(2)}" oninput="updateCustomAllocation()" style="width: 80px; background: transparent; border: none; border-bottom: 1px solid var(--border); color: inherit; font: inherit; text-align: center; outline: none;">
                    </div>
                    <div class="bucket-name">Lifestyle</div>
                </div>
                <div class="bucket">
                    <div class="bucket-val" style="display: flex; align-items: center; justify-content: center;">
                        <span style="color: var(--muted); margin-right: 4px;">$</span>
                        <input type="number" id="alloc-emergency" value="${splits.emergency.toFixed(2)}" oninput="updateCustomAllocation()" style="width: 80px; background: transparent; border: none; border-bottom: 1px solid var(--border); color: inherit; font: inherit; text-align: center; outline: none;">
                    </div>
                    <div class="bucket-name">Emergency</div>
                </div>
                <div class="bucket">
                    <div class="bucket-val" style="display: flex; align-items: center; justify-content: center;">
                        <span style="color: var(--muted); margin-right: 4px;">$</span>
                        <input type="number" id="alloc-recap" value="${splits.recap.toFixed(2)}" oninput="updateCustomAllocation()" style="width: 80px; background: transparent; border: none; border-bottom: 1px solid var(--border); color: inherit; font: inherit; text-align: center; outline: none;">
                    </div>
                    <div class="bucket-name">Recapitalization</div>
                </div>
                <div class="bucket">
                    <div class="bucket-val" style="display: flex; align-items: center; justify-content: center;">
                        <span style="color: var(--muted); margin-right: 4px;">$</span>
                        <input type="number" id="alloc-investment" value="${splits.investment.toFixed(2)}" oninput="updateCustomAllocation()" style="width: 80px; background: transparent; border: none; border-bottom: 1px solid var(--border); color: inherit; font: inherit; text-align: center; outline: none;">
                    </div>
                    <div class="bucket-name">Investments</div>
                </div>
            `;

        renderAllocationVaR(splits);
      };

      function renderAllocationVaR(splits) {
        const heatmap = document.getElementById("allocation-var-heatmap");
        if (!heatmap) return;

        // Mock VaR coefficients for different buckets
        const varCoeffs = {
          lifestyle: 0.02, // Low risk (cash)
          emergency: 0.01, // Very low risk (liquid)
          recap: 0.08, // High risk (trading capital)
          investment: 0.15, // Variable risk (long term assets)
        };

        const buckets = Object.keys(splits).filter((k) => k !== "total");
        const totalCapital = Object.values(splits).reduce((a, b) => a + b, 0);

        let totalVaR = 0;
        let cells = "";

        buckets.forEach((key) => {
          const amount = splits[key];
          const bucketVaR = amount * varCoeffs[key];
          totalVaR += bucketVaR;

          const intensity = varCoeffs[key] / 0.15; // Scale relative to max risk
          const opacity = 0.1 + intensity * 0.4;
          const color =
            key === "recap"
              ? "244, 63, 94"
              : key === "investment"
                ? "139, 92, 246"
                : "16, 185, 129";

          cells += `
                    <div class="heatmap-cell" style="background: rgba(${color}, ${opacity}); border-color: rgba(${color}, ${opacity + 0.2})">
                        <div class="heatmap-label">${key}</div>
                        <div class="heatmap-value">$${(bucketVaR || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                        <div style="font-size: 0.6rem; color: var(--muted); margin-top: 4px;">VaR: ${(varCoeffs[key] * 100).toFixed(0)}%</div>
                    </div>
                `;
        });

        const totalVaRPct =
          totalCapital > 0 ? (totalVaR / totalCapital) * 100 : 0;
        const varBadge = document.getElementById("plan-var-total");
        if (varBadge) {
          varBadge.innerText = `Plan VaR: ${totalVaRPct.toFixed(2)}%`;
          varBadge.className = `risk-badge ${totalVaRPct > 10 ? "risk-high" : totalVaRPct > 5 ? "risk-med" : "risk-low"}`;
        }

        heatmap.innerHTML = cells;
      }

      window.executeAllocation = function () {
        const amount = parseFloat(
          document.getElementById("alloc-amount").value,
        );
        if (!amount) return;

        const accountId = document.getElementById("alloc-account").value;
        const account = Store.accounts.find((a) => a.id == accountId);

        if (!account) {
          alert("Please select a source account.");
          return;
        }

        if (account.balance < amount) {
          alert("Insufficient balance in the selected account.");
          return;
        }

        const phase = parseInt(document.getElementById("alloc-phase").value);

        const lifestyle =
          parseFloat(document.getElementById("alloc-lifestyle").value) || 0;
        const emergency =
          parseFloat(document.getElementById("alloc-emergency").value) || 0;
        const recap =
          parseFloat(document.getElementById("alloc-recap").value) || 0;
        const investment =
          parseFloat(document.getElementById("alloc-investment").value) || 0;

        // Deduct from account
        account.balance -= amount;
        account.equity -= amount;

        const alloc = {
          date: new Date().toLocaleDateString(),
          amount,
          phase,
          lifestyle,
          emergency,
          recap,
          investment,
          accountId: account.id,
          accountName: account.name,
        };

        Store.allocations.unshift(alloc);

        // Add to money flow
        Store.transactions.unshift({
          date: new Date().toLocaleDateString(),
          type: "Outflow",
          category: "Investment",
          amount: alloc.investment,
          desc: `Phase ${phase} Allocation from ${account.name}`,
        });

        Store.save();
        document.getElementById("alloc-amount").value = "";
        updateAllocPreview();
        renderAll();
      };

      // --- Risk Engine ---
      window.updateRiskEngine = function (manualChange = false) {
        try {
          if (manualChange) {
            const riskInput = document.getElementById("open-risk-input");
            const ddInput = document.getElementById("max-dd-input");
            if (riskInput)
              Store.settings.openRisk = parseFloat(riskInput.value) || 0;
            if (ddInput)
              Store.settings.maxAllowedDD = parseFloat(ddInput.value) || 10;
            Store.save();
            return;
          }

          const openRisk = Store.settings.openRisk || 0;
          const totalEquity = Store.accounts.reduce(
            (sum, a) => sum + (a.equity || 0),
            0,
          );

          const riskPct = totalEquity > 0 ? (openRisk / totalEquity) * 100 : 0;

          // Update Risk View Elements
          const meter = document.getElementById("risk-meter");
          const warning = document.getElementById("risk-warning");
          const dashboardRisk = document.getElementById("total-risk");
          const dashboardStatus = document.getElementById("risk-status");

          const riskText = riskPct.toFixed(2) + "%";
          if (meter) meter.innerText = riskText;
          if (dashboardRisk) dashboardRisk.innerText = riskText;

          let statusLabel = "SAFE";
          let statusColor = "var(--success)";

          const thresholds = Store.settings.riskThresholds || {
            safe: 2,
            med: 5,
          };

          if (riskPct < thresholds.safe) {
            statusLabel = "SAFE";
            statusColor = "var(--success)";
          } else if (riskPct < thresholds.med) {
            statusLabel = "MODERATE";
            statusColor = "var(--warning)";
          } else {
            statusLabel = "CRITICAL";
            statusColor = "var(--danger)";
          }

          if (meter) meter.style.color = statusColor;
          if (warning) {
            warning.innerText = `PORTFOLIO EXPOSURE: ${statusLabel}`;
            warning.style.color = statusColor;
          }
          if (dashboardStatus) {
            dashboardStatus.innerText = statusLabel;
            dashboardStatus.className = `stat-delta ${riskPct >= thresholds.med ? "delta-down" : "delta-up"}`;
            dashboardStatus.style.color = statusColor;
          }

          // Sync inputs if they exist
          const riskInput = document.getElementById("open-risk-input");
          const ddInput = document.getElementById("max-dd-input");
          if (riskInput && !manualChange)
            riskInput.value = Store.settings.openRisk || 0;
          if (ddInput && !manualChange)
            ddInput.value = Store.settings.maxAllowedDD || 10;

          if (typeof renderRiskHeatmap === "function") renderRiskHeatmap();
          if (typeof updateExposureAnalysis === "function")
            updateExposureAnalysis();
        } catch (e) {
          console.error("Error in updateRiskEngine:", e);
        }
      };

      window.updatePsychRiskEngine = function () {
        const riskBadge = document.getElementById("risk-status-badge");
        const lossesEl = document.getElementById("risk-consecutive-losses");
        const emotionEl = document.getElementById("risk-emotion-score");
        const recommendationEl = document.getElementById("risk-recommendation");
        const alertBox = document.getElementById("risk-alert-box");

        if (
          !riskBadge ||
          !lossesEl ||
          !emotionEl ||
          !recommendationEl ||
          !alertBox
        )
          return;

        // Get last 10 trades
        const recentTrades = Store.trades.slice(0, 10);

        // Calculate consecutive losses
        let consecutiveLosses = 0;
        for (let i = 0; i < Store.trades.length; i++) {
          if (Store.trades[i].r < 0) {
            consecutiveLosses++;
          } else {
            break;
          }
        }

        // Calculate emotion score (average of last 10 psychScore)
        let totalPsychScore = 0;
        let psychCount = 0;
        recentTrades.forEach((t) => {
          if (t.psychScore !== undefined) {
            totalPsychScore += t.psychScore;
            psychCount++;
          }
        });
        const avgPsychScore =
          psychCount > 0 ? totalPsychScore / psychCount : 10;
        const emotionPct = (avgPsychScore / 10) * 100;

        lossesEl.innerText = consecutiveLosses;
        emotionEl.innerText = Math.round(emotionPct) + "%";

        // Rules
        if (consecutiveLosses >= 3) {
          riskBadge.innerText = "CRITICAL";
          riskBadge.className = "risk-badge risk-high";
          recommendationEl.innerText = "STOP TRADING";
          recommendationEl.style.color = "var(--danger)";
          alertBox.style.display = "block";
          alertBox.style.background = "rgba(244, 63, 94, 0.15)";
          alertBox.style.border = "2px solid var(--danger)";
          alertBox.style.color = "var(--danger)";
          alertBox.style.animation = "pulse-red 2s infinite";
          alertBox.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 16px; padding: 8px;">
                        <i data-lucide="octagon-alert" style="width: 48px; height: 48px;"></i>
                        <div>
                            <h3 style="margin: 0; font-size: 1.2rem; text-transform: uppercase;">STOP TRADING SIGNAL</h3>
                            <p style="margin: 4px 0 0 0; font-size: 0.95rem;">You have hit 3 consecutive losses. Your psychological state may be compromised. <strong>Step away from the charts immediately.</strong></p>
                        </div>
                    </div>
                `;
        } else if (consecutiveLosses === 2) {
          riskBadge.innerText = "WARNING";
          riskBadge.className = "risk-badge risk-med";
          recommendationEl.innerText = "Reduce Risk 50%";
          recommendationEl.style.color = "var(--warning)";
          alertBox.style.display = "block";
          alertBox.style.background = "rgba(245, 158, 11, 0.1)";
          alertBox.style.border = "1px solid var(--warning)";
          alertBox.style.color = "var(--warning)";
          alertBox.style.animation = "none";
          alertBox.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <i data-lucide="alert-triangle"></i>
                        <div>
                            <strong>CAUTION: 2 Consecutive Losses</strong><br>
                            Suggest reducing your position size by 50% for the next trade to protect capital and mental state.
                        </div>
                    </div>
                `;
        } else {
          riskBadge.innerText = "NORMAL";
          riskBadge.className = "risk-badge risk-low";
          recommendationEl.innerText = "Standard Risk";
          recommendationEl.style.color = "var(--success)";
          alertBox.style.display = "none";
          alertBox.style.animation = "none";
        }

        // Emotion impact
        if (emotionPct < 60 && consecutiveLosses < 3) {
          recommendationEl.innerText = "Reduce Risk (Low Emotion)";
          recommendationEl.style.color = "var(--warning)";
        }

        lucide.createIcons();
      };

      window.updateAdvancedIntelligence = function () {
        if (!Store.trades) Store.trades = [];
        if (!Store.accounts) Store.accounts = [];
        if (!Store.planner) Store.planner = {};
        if (!Store.backtests) Store.backtests = [];

        // 1. Daily Discipline Score
        const today = new Date().toISOString().split("T")[0];
        const tradesToday = Store.trades.filter((t) => t.date === today);

        // Find any daily plan for today across all accounts
        const planKeys = Object.keys(Store.planner).filter((k) =>
          k.startsWith(`Daily_${today}_`),
        );
        const plan = planKeys.length > 0 ? Store.planner[planKeys[0]] : null;

        let disciplineScore = 100;
        let feedback = "Strong discipline. Maintain current execution.";

        const maxTrades = plan && plan.numTrades ? parseInt(plan.numTrades) : 3;

        // Overtrading
        if (tradesToday.length > maxTrades) {
          const extra = tradesToday.length - maxTrades;
          disciplineScore -= extra * 10;
          feedback = "Overtrading detected. Reduce frequency.";
        }

        // Risk Violation
        const riskViolations = tradesToday.filter(
          (t) => t.mistake === "Overleveraged",
        ).length;
        if (riskViolations > 0) {
          disciplineScore -= 20;
          feedback =
            "Risk violation detected. Stick to allowed risk per trade.";
        }

        // Emotion impact
        const highEmotionTrades = tradesToday.filter(
          (t) => t.psychScore < 4,
        ).length;
        if (highEmotionTrades > 0) {
          disciplineScore -= 10;
          feedback = "High emotional impact detected. Take a break.";
        }

        // Trading after 2+ losses
        let consecutiveLossesToday = 0;
        let hasTradedAfterTwoLosses = false;
        for (let i = tradesToday.length - 1; i >= 0; i--) {
          if (tradesToday[i].r < 0) {
            consecutiveLossesToday++;
          } else {
            consecutiveLossesToday = 0;
          }
          if (consecutiveLossesToday >= 2 && i > 0) {
            hasTradedAfterTwoLosses = true;
            break;
          }
        }
        if (hasTradedAfterTwoLosses) {
          disciplineScore -= 15;
          feedback =
            "Trading after consecutive losses. Risk of revenge trading.";
        }

        disciplineScore = Math.max(0, disciplineScore);

        const scoreEl = document.getElementById("discipline-score");
        const statusEl = document.getElementById("discipline-status");
        const feedbackEl = document.getElementById("discipline-feedback");

        if (scoreEl && statusEl && feedbackEl) {
          scoreEl.innerText = disciplineScore;
          feedbackEl.innerText = `"${feedback}"`;

          if (disciplineScore >= 80) {
            statusEl.innerText = "Disciplined";
            statusEl.className = "risk-badge risk-low";
          } else if (disciplineScore >= 50) {
            statusEl.innerText = "Warning";
            statusEl.className = "risk-badge risk-med";
          } else {
            statusEl.innerText = "Undisciplined";
            statusEl.className = "risk-badge risk-high";
          }
        }

        // 2. Prop Firm Failure Predictor
        const activeAccounts = Store.accounts.filter(
          (a) => a.type === "Prop" || a.type === "Challenge",
        );
        if (activeAccounts.length > 0) {
          const mainAcc = activeAccounts[0];
          const maxDD = 10;
          const currentDD = Math.max(
            0,
            ((mainAcc.balance - mainAcc.equity) / mainAcc.balance) * 100,
          );

          const drawdownRatio = currentDD / maxDD;

          let consecutiveLosses = 0;
          for (let i = 0; i < Store.trades.length; i++) {
            if (Store.trades[i].r < 0) consecutiveLosses++;
            else break;
          }

          const riskPerTrade = 1;
          const riskPressure = riskPerTrade * consecutiveLosses;

          let failureScore =
            drawdownRatio * 50 + riskPressure * 10 + consecutiveLosses * 10;
          failureScore = Math.min(100, Math.max(0, Math.round(failureScore)));

          const failProbEl = document.getElementById("failure-probability");
          const failStatusEl = document.getElementById("failure-status-badge");
          const failMsgEl = document.getElementById("failure-warning-message");
          const failBarEl = document.getElementById("failure-progress-bar");

          if (failProbEl && failStatusEl && failMsgEl && failBarEl) {
            failProbEl.innerText = failureScore + "%";
            failBarEl.style.width = failureScore + "%";

            if (failureScore <= 30) {
              failStatusEl.innerText = "Safe";
              failStatusEl.className = "risk-badge risk-low";
              failMsgEl.innerText = "Risk levels are within safe parameters.";
              failMsgEl.style.color = "var(--success)";
              failBarEl.style.background = "var(--success)";
            } else if (failureScore <= 60) {
              failStatusEl.innerText = "Moderate Risk";
              failStatusEl.className = "risk-badge risk-med";
              failMsgEl.innerText =
                "Moderate risk detected. Monitor drawdown closely.";
              failMsgEl.style.color = "var(--warning)";
              failBarEl.style.background = "var(--warning)";
            } else if (failureScore <= 80) {
              failStatusEl.innerText = "High Risk";
              failStatusEl.className = "risk-badge risk-high";
              failMsgEl.innerText =
                "High probability of breach. Reduce risk immediately.";
              failMsgEl.style.color = "var(--danger)";
              failBarEl.style.background = "var(--danger)";
            } else {
              failStatusEl.innerText = "Critical";
              failStatusEl.className = "risk-badge risk-high";
              failMsgEl.innerText =
                "Critical state. Stop trading to prevent breach.";
              failMsgEl.style.color = "var(--danger)";
              failBarEl.style.background = "var(--danger)";
              failBarEl.style.animation = "pulse-red 1s infinite";
            }
          }
        }

        // 3. Strategy Auto-Kill Insight Panel
        const intelPanel = document.getElementById(
          "strategy-intelligence-output",
        );
        if (intelPanel && Store.backtests.length > 0) {
          const disabled = Store.backtests.filter(
            (b) => b.winrate < 40 || b.pf < 1.2 || b.dd > 25,
          );
          const best = [...Store.backtests]
            .filter((b) => b.winrate >= 40 && b.pf >= 1.2 && b.dd <= 25)
            .sort((a, b) => b.pf - a.pf)[0];

          let html = "";
          if (disabled.length > 0) {
            html += `<div style="color: var(--danger); margin-bottom: 8px;"><i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle;"></i> Avoid <strong>${disabled.map((d) => d.name).join(", ")}</strong> → low profitability or high risk.</div>`;
          }
          if (best) {
            html += `<div style="color: var(--success);"><i data-lucide="check-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle;"></i> Focus on <strong>${best.name}</strong> → highest performance metrics.</div>`;
          } else if (
            Store.backtests.length > 0 &&
            disabled.length === Store.backtests.length
          ) {
            html += `<div style="color: var(--warning);">All strategies currently disabled. Refine your edge.</div>`;
          }

          intelPanel.innerHTML =
            html || "Log backtests to see performance insights.";
          lucide.createIcons();
        }
      };

      // --- Live Market Simulation ---
      function startLiveSimulation() {
        setInterval(() => {
          if (Store.accounts.length === 0) return;

          // Simulate small equity fluctuations (-0.05% to +0.05%)
          Store.accounts.forEach((acc) => {
            const change = 1 + (Math.random() * 0.001 - 0.0005);
            acc.equity = acc.balance * change;
          });

          // Update UI without full re-render for performance
          const totalEquity = Store.accounts.reduce(
            (sum, a) => sum + (a.equity || 0),
            0,
          );
          const totalEquityEl = document.getElementById("total-equity");
          if (totalEquityEl)
            totalEquityEl.innerText = `$${(totalEquity || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

          updateRiskEngine();
        }, 3000); // Update every 3 seconds
      }

      function renderRiskHeatmap() {
        const heatmap = document.getElementById("risk-heatmap");
        if (!heatmap) return;

        const types = ["Live", "Prop"];
        const assetClasses = [
          "Forex",
          "Crypto",
          "Equities",
          "Indices",
          "Commodities",
        ];

        let cells = "";
        let maxExposure = 0;
        const data = {};

        // Calculate exposures
        assetClasses.forEach((ac) => {
          types.forEach((t) => {
            const key = `${ac}-${t}`;
            const exposure = Store.accounts
              .filter((a) => (a.assetClass || "Forex") === ac && a.type === t)
              .reduce((sum, a) => sum + a.balance, 0);
            data[key] = exposure;
            if (exposure > maxExposure) maxExposure = exposure;
          });
        });

        // Render cells
        assetClasses.forEach((ac) => {
          types.forEach((t) => {
            const key = `${ac}-${t}`;
            const val = data[key];
            const intensity = maxExposure > 0 ? val / maxExposure : 0;
            const opacity = 0.05 + intensity * 0.4;
            const color = t === "Live" ? "59, 130, 246" : "16, 185, 129"; // Primary vs Success

            cells += `
                        <div class="heatmap-cell" style="background: rgba(${color}, ${opacity}); border-color: rgba(${color}, ${opacity + 0.2})">
                            <div class="heatmap-label">${ac} (${t})</div>
                            <div class="heatmap-value">$${(val / 1000).toFixed(1)}K</div>
                        </div>
                    `;
          });
        });

        heatmap.innerHTML = cells;
      }

      // --- Money Flow ---
      function updateMoneyFlow() {
        const inflow = Store.transactions
          .filter((t) => t.type === "Inflow")
          .reduce((sum, t) => sum + (t.amount || 0), 0);
        const outflow = Store.transactions
          .filter((t) => t.type === "Outflow")
          .reduce((sum, t) => sum + (t.amount || 0), 0);
        const net = inflow - outflow;

        const mfInflow = document.getElementById("mf-inflow");
        const mfOutflow = document.getElementById("mf-outflow");
        const mfNet = document.getElementById("mf-net");

        if (mfInflow) mfInflow.innerText = `$${inflow.toLocaleString()}`;
        if (mfOutflow) mfOutflow.innerText = `$${outflow.toLocaleString()}`;
        if (mfNet) {
          mfNet.innerText = `$${net.toLocaleString()}`;
          mfNet.style.color = net >= 0 ? "var(--success)" : "var(--danger)";
        }

        // Chart
        const mfCtx = document.getElementById("mfChart");
        if (!mfCtx) return;

        if (window.mfChartObj) window.mfChartObj.destroy();

        // Group by date
        const grouped = {};
        [...Store.transactions].reverse().forEach((t) => {
          if (!grouped[t.date]) grouped[t.date] = { in: 0, out: 0 };
          if (t.type === "Inflow") grouped[t.date].in += t.amount || 0;
          else grouped[t.date].out += t.amount || 0;
        });

        const labels = Object.keys(grouped);
        const inData = labels.map((l) => grouped[l].in);
        const outData = labels.map((l) => grouped[l].out);

        window.mfChartObj = new Chart(mfCtx, {
          type: "bar",
          data: {
            labels: labels,
            datasets: [
              { label: "Inflow", data: inData, backgroundColor: "#10b981" },
              { label: "Outflow", data: outData, backgroundColor: "#ef4444" },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                beginAtZero: true,
                grid: { color: "rgba(255,255,255,0.05)" },
              },
              x: { grid: { display: false } },
            },
            plugins: { legend: { display: true } },
          },
        });
      }

      window.saveTransaction = function () {
        const tx = {
          date: new Date().toLocaleDateString(),
          type: document.getElementById("tx-type").value,
          category: document.getElementById("tx-category").value,
          amount: parseFloat(document.getElementById("tx-amount").value),
          desc: document.getElementById("tx-desc").value,
        };
        Store.transactions.unshift(tx);
        Store.save();
        closeModal();
        renderAll();
      };

      // --- Simulation ---
      window.runSimulation = function () {
        const start = parseFloat(document.getElementById("sim-start").value);
        const ret =
          parseFloat(document.getElementById("sim-return").value) / 100;
        const months = parseInt(document.getElementById("sim-months").value);

        let current = start;
        const data = [start];
        const labels = ["Month 0"];

        for (let i = 1; i <= months; i++) {
          current = current * (1 + ret);
          data.push(current);
          labels.push(`Month ${i}`);
        }

        if (window.simChartObj) window.simChartObj.destroy();
        const ctx = document.getElementById("simChart").getContext("2d");
        window.simChartObj = new Chart(ctx, {
          type: "line",
          data: {
            labels,
            datasets: [
              {
                label: "Projected Growth",
                data,
                borderColor: "#3b82f6",
                backgroundColor: "rgba(59, 130, 246, 0.1)",
                fill: true,
                tension: 0.4,
              },
            ],
          },
          options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
              y: { grid: { color: "#27272a" }, ticks: { color: "#71717a" } },
              x: { grid: { display: false }, ticks: { color: "#71717a" } },
            },
          },
        });
      };

      window.saveScalingMilestone = function () {
        const id = document.getElementById("scaling-id").value;
        const name = document.getElementById("scaling-name").value;
        const cost = parseFloat(document.getElementById("scaling-cost").value);
        const status = document.getElementById("scaling-status").value;

        if (!name || isNaN(cost)) {
          alert("Please fill in all required fields.");
          return;
        }

        if (!Store.scalingMilestones) Store.scalingMilestones = [];

        if (id) {
          const ms = Store.scalingMilestones.find((m) => m.id === parseInt(id));
          if (ms) {
            ms.name = name;
            ms.cost = cost;
            ms.status = status;
          }
        } else {
          Store.scalingMilestones.push({
            id: Date.now(),
            name,
            cost,
            status,
          });
        }

        closeModal();
        renderScalingMilestones();
        saveData();
      };

      window.deleteScalingMilestone = function (id) {
        if (confirm("Are you sure you want to delete this milestone?")) {
          Store.scalingMilestones = Store.scalingMilestones.filter(
            (m) => m.id !== id,
          );
          renderScalingMilestones();
          saveData();
        }
      };

      window.renderScalingMilestones = function () {
        const list = document.getElementById("scaling-milestones-list");
        if (!list) return;

        if (!Store.scalingMilestones) Store.scalingMilestones = [];

        list.innerHTML = Store.scalingMilestones
          .map(
            (ms) => `
                <div class="card" style="padding: 16px; border-left: 4px solid ${ms.status === "Purchased" ? "var(--success)" : "var(--primary)"}">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                        <div>
                            <div style="font-weight: 700; font-size: 1.1rem; margin-bottom: 4px;">${ms.name}</div>
                            <div style="font-size: 0.85rem; color: var(--muted);">Cost: $${ms.cost.toLocaleString()}</div>
                        </div>
                        <div class="risk-badge ${ms.status === "Purchased" ? "risk-low" : "risk-med"}">${ms.status}</div>
                    </div>
                    <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px;">
                        <button class="secondary" style="padding: 4px 8px; font-size: 0.8rem;" onclick="document.getElementById('scaling-id').value='${ms.id}'; document.getElementById('scaling-name').value='${ms.name}'; document.getElementById('scaling-cost').value='${ms.cost}'; document.getElementById('scaling-status').value='${ms.status}'; openModal('modal-scaling-milestone');"><i data-lucide="edit" style="width:14px;height:14px;"></i></button>
                        <button class="secondary" style="padding: 4px 8px; font-size: 0.8rem; color: var(--danger); border-color: var(--danger);" onclick="deleteScalingMilestone(${ms.id})"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
                    </div>
                </div>
            `,
          )
          .join("");

        // Update Total Scaling Capital
        const totalPayouts = Store.payouts
          ? Store.payouts.reduce((sum, p) => sum + (p.amount || 0), 0)
          : 0;
        const totalPurchased = Store.scalingMilestones
          .filter((m) => m.status === "Purchased")
          .reduce((sum, m) => sum + (m.cost || 0), 0);
        const availableCapital = totalPayouts - totalPurchased;

        const capitalEl = document.getElementById("total-scaling-capital");
        if (capitalEl) {
          capitalEl.innerText = `$${availableCapital.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          capitalEl.style.color =
            availableCapital >= 0 ? "var(--success)" : "var(--danger)";
        }

        lucide.createIcons({ root: list });
      };

      // --- Rendering ---
      function renderAll() {
        if (typeof updateAdvancedIntelligence === "function")
          updateAdvancedIntelligence();
        if (typeof updateExposureAnalysis === "function")
          updateExposureAnalysis();
        if (typeof updateRedZoneAnalysis === "function")
          updateRedZoneAnalysis();
        if (typeof renderAlphaChart === "function") renderAlphaChart();
        if (typeof renderStrategyCorrelationMatrix === "function")
          renderStrategyCorrelationMatrix();

        // Equity Protector (Soft Lock)
        const disciplineScore =
          parseInt(document.getElementById("discipline-score")?.innerText) ||
          100;
        if (disciplineScore < 60) {
          const dashboard = document.getElementById("dashboard");
          if (dashboard && !document.getElementById("soft-lock-overlay")) {
            const overlay = document.createElement("div");
            overlay.id = "soft-lock-overlay";
            overlay.style =
              "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 9999; display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; text-align: center; padding: 20px;";
            overlay.innerHTML = `
                        <i data-lucide="lock" style="width: 64px; height: 64px; color: var(--danger); margin-bottom: 24px;"></i>
                        <h1 style="font-size: 2rem; margin-bottom: 16px;">EQUITY PROTECTOR ACTIVE</h1>
                        <p style="font-size: 1.2rem; color: var(--muted); max-width: 600px; margin-bottom: 32px;">
                            Your Daily Discipline Score has dropped below 60. To protect your capital, the system has locked trading operations for the next 24 hours.
                        </p>
                        <button onclick="this.parentElement.remove()" style="background: var(--danger); color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 600;">Acknowledge & Review Rules</button>
                    `;
            document.body.appendChild(overlay);
            lucide.createIcons({ root: overlay });
          }
        }

        try {
          // Dashboard Stats
          const totalAUM = Store.accounts.reduce(
            (sum, a) => sum + (a.balance || 0),
            0,
          );
          const totalEquity = Store.accounts.reduce(
            (sum, a) => sum + (a.equity || 0),
            0,
          );
          const netFlow = Store.transactions.reduce(
            (sum, t) =>
              sum + (t.type === "Inflow" ? t.amount || 0 : -(t.amount || 0)),
            0,
          );

          const aumEl = document.getElementById("total-aum");
          const equityEl = document.getElementById("total-equity");
          const flowEl = document.getElementById("net-cashflow");

          if (aumEl) aumEl.innerText = `$${(totalAUM || 0).toLocaleString()}`;
          if (equityEl)
            equityEl.innerText = `$${(totalEquity || 0).toLocaleString()}`;
          if (flowEl) flowEl.innerText = `$${(netFlow || 0).toLocaleString()}`;

          if (typeof renderInvestments === "function") renderInvestments();
          if (typeof renderScalingMilestones === "function")
            renderScalingMilestones();

          updateCharts();
          updateTradeCharts();
          updatePsychRiskEngine();
          if (typeof updateMoneyFlow === "function") updateMoneyFlow();
          if (typeof updatePerformanceMetrics === "function")
            updatePerformanceMetrics();
          if (typeof updateTradingPlanView === "function")
            updateTradingPlanView();
          if (typeof updateRiskEngine === "function") updateRiskEngine();

          checkDrawdownAlerts();
        } catch (e) {
          console.error("Error in renderAll core:", e);
        }

        try {
          if (Notification.permission === "default") {
            Notification.requestPermission();
          }
        } catch (e) {}

        try {
          const leaderboard = document.getElementById(
            "performance-leaderboard",
          );
          if (leaderboard) {
            const sortedAccounts = [...Store.accounts]
              .sort((a, b) => {
                const initialA =
                  a.history && a.history[0]
                    ? typeof a.history[0] === "number"
                      ? a.history[0]
                      : a.history[0].balance
                    : a.balance;
                const initialB =
                  b.history && b.history[0]
                    ? typeof b.history[0] === "number"
                      ? b.history[0]
                      : b.history[0].balance
                    : b.balance;
                const roiA =
                  initialA > 0 ? (a.balance - initialA) / initialA : 0;
                const roiB =
                  initialB > 0 ? (b.balance - initialB) / initialB : 0;
                return roiB - roiA;
              })
              .slice(0, 4);

            leaderboard.innerHTML =
              sortedAccounts
                .map((a) => {
                  const initial =
                    a.history && a.history[0]
                      ? typeof a.history[0] === "number"
                        ? a.history[0]
                        : a.history[0].balance
                      : a.balance;
                  const roi =
                    initial > 0 ? ((a.balance - initial) / initial) * 100 : 0;
                  return `
                            <div class="card col-3" style="padding: 16px; background: rgba(24, 24, 27, 0.3);">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                    <div class="stat-label" style="margin: 0;">${a.assetClass || "Forex"}</div>
                                    <div class="stat-delta ${roi >= 0 ? "delta-up" : "delta-down"}" style="margin: 0;">
                                        ${roi >= 0 ? "+" : ""}${roi.toFixed(2)}%
                                    </div>
                                </div>
                                <div style="font-weight: 700; font-size: 1rem; margin-bottom: 4px;">${a.name}</div>
                                <div style="font-size: 0.75rem; color: var(--muted); font-family: var(--font-mono);">$${(a.balance || 0).toLocaleString()}</div>
                            </div>
                        `;
                })
                .join("") ||
              '<div class="col-12" style="text-align: center; color: var(--muted); padding: 20px;">No performance data available</div>';
          }
        } catch (e) {
          console.error("Error in leaderboard render:", e);
        }

        try {
          // Milestones
          const milestoneGrid = document.getElementById("milestone-grid");
          if (milestoneGrid) {
            const totalAUM = Store.accounts.reduce(
              (sum, a) => sum + (a.balance || 0),
              0,
            );
            const totalEquity = Store.accounts.reduce(
              (sum, a) => sum + (a.equity || 0),
              0,
            );
            const totalPayouts = Store.payouts.reduce(
              (sum, p) => sum + p.amount,
              0,
            );

            milestoneGrid.innerHTML =
              Store.milestones
                .map((m) => {
                  let current = 0;
                  if (m.metric === "AUM") current = totalAUM;
                  else if (m.metric === "Equity") current = totalEquity;
                  else if (m.metric === "Payouts") current = totalPayouts;

                  let progress = Math.min(
                    100,
                    Math.max(0, (current / m.target) * 100),
                  );
                  const isCompleted = progress >= 100;

                  return `
                            <div class="card col-4" style="padding: 16px; background: rgba(24, 24, 27, 0.3); border: 1px solid ${isCompleted ? "var(--success)" : "var(--border)"};">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                                    <div>
                                        <div style="font-weight: 600; font-size: 1rem; color: ${isCompleted ? "var(--success)" : "var(--text)"};">${m.name}</div>
                                        <div style="font-size: 0.75rem; color: var(--muted); margin-top: 4px;">Metric: ${m.metric}</div>
                                    </div>
                                    <button class="icon-btn" onclick="deleteMilestone(${m.id})" title="Delete Milestone">
                                        <i data-lucide="trash-2" style="color: var(--danger); width: 16px; height: 16px;"></i>
                                    </button>
                                </div>
                            <div style="display: flex; justify-content: space-between; font-size: 0.875rem; margin-bottom: 8px;">
                                <span>$${current.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                <span style="color: var(--muted)">$${m.target.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                            </div>
                            <div class="progress-container">
                                <div class="progress-bar" style="width: ${progress}%; background: ${isCompleted ? "var(--success)" : "var(--primary)"};"></div>
                            </div>
                            <div style="text-align: right; font-size: 0.75rem; margin-top: 8px; color: ${isCompleted ? "var(--success)" : "var(--muted)"};">
                                ${progress.toFixed(1)}%
                            </div>
                        </div>
                    `;
                })
                .join("") ||
              '<div class="col-12" style="text-align: center; color: var(--muted); padding: 20px;">No milestones set.</div>';
          }
        } catch (e) {
          console.error("Error in milestones render:", e);
        }

        try {
          // Trade Journal Stats
          const totalR = Store.trades.reduce((sum, t) => sum + t.r, 0);
          const wins = Store.trades.filter((t) => t.r > 0).length;
          const winRate =
            Store.trades.length > 0 ? (wins / Store.trades.length) * 100 : 0;

          const grossProfit = Store.trades
            .filter((t) => t.r > 0)
            .reduce((sum, t) => sum + t.r, 0);
          const grossLoss = Math.abs(
            Store.trades
              .filter((t) => t.r < 0)
              .reduce((sum, t) => sum + t.r, 0),
          );
          const profitFactor =
            grossLoss > 0
              ? grossProfit / grossLoss
              : grossProfit > 0
                ? grossProfit
                : 0;

          // Calculate Max DD, Streaks, Mistake Cost
          let currentStreak = 0;
          let bestStreak = 0;
          let peakR = 0;
          let maxDD = 0;
          let currentCumulativeR = 0;
          let mistakeCost = 0;

          const sortedTrades = [...Store.trades].sort(
            (a, b) => new Date(a.date) - new Date(b.date),
          );
          sortedTrades.forEach((t) => {
            // Streaks
            if (t.r > 0) {
              currentStreak++;
              if (currentStreak > bestStreak) bestStreak = currentStreak;
            } else if (t.r < 0) {
              currentStreak = 0;
            }

            // Drawdown
            currentCumulativeR += t.r;
            if (currentCumulativeR > peakR) peakR = currentCumulativeR;
            const dd = peakR - currentCumulativeR;
            if (dd > maxDD) maxDD = dd;

            // Mistakes
            if (t.mistake && t.mistake !== "None" && t.r < 0) {
              mistakeCost += Math.abs(t.r);
            }
          });

          const tjTotalR = document.getElementById("tj-total-r");
          if (tjTotalR) {
            tjTotalR.innerText = `${totalR > 0 ? "+" : ""}${totalR.toFixed(2)}R`;
            tjTotalR.style.color =
              totalR >= 0 ? "var(--success)" : "var(--danger)";
            const winRateEl = document.getElementById("tj-win-rate");
            const pfEl = document.getElementById("tj-profit-factor");
            const maxDDEl = document.getElementById("tj-max-dd");
            const streakEl = document.getElementById("tj-best-streak");
            const mistakeEl = document.getElementById("tj-mistake-cost");

            if (winRateEl) winRateEl.innerText = `${winRate.toFixed(1)}%`;
            if (pfEl) pfEl.innerText = profitFactor.toFixed(2);
            if (maxDDEl) maxDDEl.innerText = `-${maxDD.toFixed(2)}R`;
            if (streakEl) streakEl.innerText = bestStreak;
            if (mistakeEl) mistakeEl.innerText = `-${mistakeCost.toFixed(2)}R`;
          }
        } catch (e) {
          console.error("Error in trade journal stats render:", e);
        }

        try {
          // Populate Filters
          const assetFilter = document.getElementById("filter-asset");
          if (assetFilter) {
            const assets = [
              ...new Set(Store.trades.map((t) => t.asset)),
            ].filter(Boolean);
            const currentVal = assetFilter.value;
            assetFilter.innerHTML =
              `<option value="All">All Assets</option>` +
              assets.map((a) => `<option value="${a}">${a}</option>`).join("");
            if (assets.includes(currentVal)) assetFilter.value = currentVal;
          }
        } catch (e) {
          console.error("Error in filters render:", e);
        }

        try {
          // Render Table and Calendar
          if (document.getElementById("trades-table-body")) {
            if (typeof renderTradeTable === "function") renderTradeTable();
            if (typeof renderTradeCalendar === "function")
              renderTradeCalendar();
          }
        } catch (e) {
          console.error("Error in trade table/calendar render:", e);
        }

        try {
          const btGrid = document.getElementById("backtests-grid");
          if (btGrid) {
            btGrid.innerHTML =
              Store.backtests
                .map((b) => {
                  // Strategy Auto-Kill Logic
                  let status = "Active";
                  let statusClass = "risk-low";
                  let isDisabled = false;

                  if (b.winrate < 40 || b.pf < 1.2 || b.dd > 25) {
                    status = "DISABLED";
                    statusClass = "risk-high";
                    isDisabled = true;
                  } else if (b.winrate < 45 || b.pf < 1.5 || b.dd > 15) {
                    status = "Warning";
                    statusClass = "risk-med";
                  }

                  return `
                        <div class="card col-4" style="${isDisabled ? "opacity: 0.7; border: 1px solid var(--danger);" : ""}">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                                <div class="stat-label">${b.name}</div>
                                <div class="risk-badge ${statusClass}">${status}</div>
                                <button class="icon-btn" onclick="deleteBacktest(${b.id})"><i data-lucide="trash-2" style="color: var(--danger); width: 16px; height: 16px;"></i></button>
                            </div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 0.875rem;">
                                <div><span style="color: var(--muted)">Win Rate:</span> <span style="font-weight: 600; color: ${b.winrate < 40 ? "var(--danger)" : "var(--success)"}">${b.winrate}%</span></div>
                                <div><span style="color: var(--muted)">Profit Factor:</span> <span style="font-weight: 600; color: ${b.pf < 1.2 ? "var(--danger)" : "var(--text)"}">${b.pf}</span></div>
                                <div><span style="color: var(--muted)">Max DD:</span> <span style="font-weight: 600; color: ${b.dd > 25 ? "var(--danger)" : "var(--text)"}">${b.dd || 0}%</span></div>
                                <div><span style="color: var(--muted)">Sample:</span> <span style="font-weight: 600;">${b.sample || 0}</span></div>
                            </div>
                            ${isDisabled ? '<div style="margin-top: 12px; font-size: 0.7rem; color: var(--danger); font-weight: 700;">AUTO-KILLED: Performance below threshold</div>' : ""}
                        </div>
                    `;
                })
                .join("") ||
              '<div class="col-12" style="text-align: center; color: var(--muted); padding: 20px;">No backtests logged.</div>';
          }
        } catch (e) {
          console.error("Error in backtests render:", e);
        }

        try {
          // Tables
          renderTable(
            "accounts-table-mini",
            Store.accounts.slice(0, 5),
            (a) => `
                    <tr>
                        <td>${a.name}</td>
                        <td>${a.assetClass || "Forex"}</td>
                        <td>${a.type}</td>
                        <td class="font-mono">$${(a.balance || 0).toLocaleString()}</td>
                        <td class="font-mono">$${(a.equity || 0).toLocaleString()}</td>
                        <td>${a.phase}</td>
                        <td><span class="risk-badge risk-low">Low</span></td>
                        <td style="color: var(--success)">${a.status}</td>
                    </tr>
                `,
          );

          renderTable(
            "accounts-table-full",
            Store.accounts,
            (a) => `
                    <tr>
                        <td>${a.name}</td>
                        <td>${a.assetClass || "Forex"}</td>
                        <td>${a.firm}</td>
                        <td>${a.type}</td>
                        <td class="font-mono">$${(a.balance || 0).toLocaleString()}</td>
                        <td class="font-mono">$${(a.equity || 0).toLocaleString()}</td>
                        <td>${a.risk}%</td>
                        <td>${a.phase}</td>
                        <td style="display: flex; gap: 4px;">
                            <button class="icon-btn" onclick="openUpdateBalanceModal(${a.id})" title="Update Balance"><i data-lucide="edit-2" style="width: 16px; height: 16px; color: var(--primary);"></i></button>
                            <button class="icon-btn" onclick="deleteAccount(${a.id})" title="Remove"><i data-lucide="trash-2" style="width: 16px; height: 16px; color: var(--danger);"></i></button>
                        </td>
                    </tr>
                `,
          );

          renderTable(
            "alloc-history",
            Store.allocations,
            (a) => `
                    <tr>
                        <td>${a.date}</td>
                        <td>${a.accountName || "-"}</td>
                        <td class="font-mono">$${(a.amount || 0).toLocaleString()}</td>
                        <td>Phase ${a.phase}</td>
                        <td class="font-mono">$${(a.lifestyle || 0).toLocaleString()}</td>
                        <td class="font-mono">$${(a.emergency || 0).toLocaleString()}</td>
                        <td class="font-mono">$${(a.recap || 0).toLocaleString()}</td>
                        <td class="font-mono">$${(a.investment || 0).toLocaleString()}</td>
                    </tr>
                `,
          );

          renderTable(
            "flow-table",
            Store.transactions,
            (t) => `
                    <tr>
                        <td>${t.date}</td>
                        <td style="color: ${t.type === "Inflow" ? "var(--success)" : "var(--danger)"}">${t.type}</td>
                        <td>${t.category}</td>
                        <td class="font-mono">$${(t.amount || 0).toLocaleString()}</td>
                        <td>${t.desc}</td>
                    </tr>
                `,
          );
        } catch (e) {
          console.error("Error in tables render:", e);
        }

        try {
          // Prop Tracker
          const propAccounts = Store.accounts.filter((a) => a.type === "Prop");

          // Populate Payout Account Dropdown
          const payoutAccountSelect = document.getElementById("payout-account");
          if (payoutAccountSelect) {
            payoutAccountSelect.innerHTML = propAccounts
              .map(
                (a) => `<option value="${a.id}">${a.name} (${a.firm})</option>`,
              )
              .join("");
          }

          // Populate Allocation Account Dropdown
          const allocAccountSelect = document.getElementById("alloc-account");
          if (allocAccountSelect) {
            allocAccountSelect.innerHTML = Store.accounts
              .map(
                (a) => `<option value="${a.id}">${a.name} (${a.firm})</option>`,
              )
              .join("");
          }

          const tradeAccountSelect = document.getElementById("trade-account");
          if (tradeAccountSelect) {
            tradeAccountSelect.innerHTML =
              '<option value="all">Unassigned</option>' +
              Store.accounts
                .map((a) => `<option value="${a.id}">${a.name}</option>`)
                .join("");
          }

          const metricsAccountSelect = document.getElementById(
            "metrics-account-filter",
          );
          if (metricsAccountSelect) {
            const currentVal = metricsAccountSelect.value;
            metricsAccountSelect.innerHTML =
              '<option value="all">All Accounts</option>' +
              Store.accounts
                .map((a) => `<option value="${a.id}">${a.name}</option>`)
                .join("");
            metricsAccountSelect.value = currentVal || "all";
          }

          const planAccountSelect = document.getElementById("plan-account");
          if (planAccountSelect) {
            const currentVal = planAccountSelect.value;
            planAccountSelect.innerHTML =
              '<option value="all">All Accounts</option>' +
              Store.accounts
                .map((a) => `<option value="${a.id}">${a.name}</option>`)
                .join("");
            planAccountSelect.value = currentVal || "all";
          }

          const propGrid = document.getElementById("prop-grid");
          if (propGrid) {
            propGrid.innerHTML = propAccounts
              .map((a) => {
                const initial =
                  a.history && a.history[0]
                    ? typeof a.history[0] === "number"
                      ? a.history[0]
                      : a.history[0].balance
                    : a.balance;
                const target = a.scalingTarget || initial * 1.1 || 1;
                let progress = 0;
                if (target > initial) {
                  progress = Math.min(
                    100,
                    Math.max(
                      0,
                      ((a.balance - initial) / (target - initial)) * 100,
                    ),
                  );
                }

                // DD Calculations
                const historyBalances =
                  a.history && a.history.length > 0
                    ? a.history.map((h) =>
                        typeof h === "number" ? h : h.balance,
                      )
                    : [a.balance];
                const maxBalance = Math.max(...historyBalances);
                const currentDD =
                  maxBalance > 0
                    ? ((maxBalance - a.balance) / maxBalance) * 100
                    : 0;
                const dailyDDLimit = a.maxDailyDD || 5;
                const totalDDLimit = a.maxTotalDD || 10;

                const dailyDDPct = Math.min(
                  100,
                  (currentDD / dailyDDLimit) * 100,
                );
                const totalDDPct = Math.min(
                  100,
                  (currentDD / totalDDLimit) * 100,
                );

                // Payout Countdown
                let payoutText = "Not set";
                if (a.nextPayoutDate) {
                  const diffTime = Math.abs(
                    new Date(a.nextPayoutDate) - new Date(),
                  );
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  payoutText = `${diffDays} days`;
                }

                return `
                        <div class="card col-4">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                                <div class="stat-label">${a.firm} | ${a.assetClass || "Forex"}</div>
                                <div class="risk-badge risk-med">${a.phase}</div>
                            </div>
                            <div class="stat-value" style="font-size: 1.25rem">${a.name}</div>
                            
                            <div style="margin-top: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 0.75rem;">
                                <div>
                                    <div style="color: var(--muted); margin-bottom: 4px; display: flex; justify-content: space-between;">
                                        <span>Daily DD</span>
                                        <span style="color: ${dailyDDPct > 80 ? "var(--danger)" : "var(--text)"}">${currentDD.toFixed(1)}% / ${dailyDDLimit}%</span>
                                    </div>
                                    <div class="progress-container" style="height: 4px;">
                                        <div class="progress-bar" style="width: ${dailyDDPct}%; background: ${dailyDDPct > 80 ? "var(--danger)" : dailyDDPct > 50 ? "var(--warning)" : "var(--success)"}"></div>
                                    </div>
                                </div>
                                <div>
                                    <div style="color: var(--muted); margin-bottom: 4px; display: flex; justify-content: space-between;">
                                        <span>Total DD</span>
                                        <span style="color: ${totalDDPct > 80 ? "var(--danger)" : "var(--text)"}">${currentDD.toFixed(1)}% / ${totalDDLimit}%</span>
                                    </div>
                                    <div class="progress-container" style="height: 4px;">
                                        <div class="progress-bar" style="width: ${totalDDPct}%; background: ${totalDDPct > 80 ? "var(--danger)" : totalDDPct > 50 ? "var(--warning)" : "var(--success)"}"></div>
                                    </div>
                                </div>
                            </div>

                            <div style="margin-top: 16px; font-size: 0.875rem; color: var(--muted)">
                                Progress to Scaling ($${target.toLocaleString()}): ${progress.toFixed(1)}%
                            </div>
                            <div class="progress-container">
                                <div class="progress-bar" style="width: ${progress}%"></div>
                            </div>
                            
                            <div style="display: flex; justify-content: space-between; margin-top: 16px; font-size: 0.75rem; align-items: center; padding-top: 12px; border-top: 1px solid var(--border);">
                                <div style="display: flex; flex-direction: column;">
                                    <span style="color: var(--muted)">Balance</span>
                                    <span style="font-weight: 600; font-size: 0.875rem;">$${(a.balance || 0).toLocaleString()}</span>
                                </div>
                                <div style="display: flex; flex-direction: column; align-items: center;">
                                    <span style="color: var(--muted)">Next Payout</span>
                                    <span style="font-weight: 600; color: var(--primary);"><i data-lucide="clock" style="width: 12px; height: 12px; display: inline; margin-right: 4px;"></i>${payoutText}</span>
                                </div>
                                <div style="display: gap: 8px;">
                                    <button class="icon-btn" onclick="openUpdateBalanceModal(${a.id})" title="Update Balance"><i data-lucide="edit-2" style="color: var(--primary); width: 16px; height: 16px;"></i></button>
                                    <button class="icon-btn" onclick="deleteAccount(${a.id})" title="Remove Account"><i data-lucide="trash-2" style="color: var(--danger); width: 16px; height: 16px;"></i></button>
                                </div>
                            </div>
                        </div>
                    `;
              })
              .join("");
          }
        } catch (e) {
          console.error("Error in prop tracker render:", e);
        }

        try {
          // Payout Tracker
          const payoutHistoryBody = document.getElementById(
            "payout-history-body",
          );
          if (payoutHistoryBody) {
            renderTable(
              "payout-history-body",
              Store.payouts,
              (p) => `
                        <tr>
                            <td>${p.date}</td>
                            <td>${p.accountName}</td>
                            <td>${p.firm}</td>
                            <td class="font-mono" style="color: var(--success)">+$${(p.amount || 0).toLocaleString()}</td>
                            <td>
                                <button class="icon-btn" onclick="deletePayout(${p.id})" title="Delete Payout">
                                    <i data-lucide="trash-2" style="color: var(--danger); width: 16px; height: 16px;"></i>
                                </button>
                            </td>
                        </tr>
                    `,
            );
          }
        } catch (e) {
          console.error("Error in payout tracker render:", e);
        }

        try {
          if (typeof renderScalingMilestones === "function")
            renderScalingMilestones();
        } catch (e) {
          console.error("Error in scaling milestones render:", e);
        }

        try {
          // Wishlist
          const wishlistGrid = document.getElementById("wishlist-grid");
          if (wishlistGrid) {
            if (Store.wishlist.length === 0) {
              wishlistGrid.innerHTML =
                '<div class="col-12" style="text-align: center; color: var(--muted); padding: 40px; background: rgba(24, 24, 27, 0.3); border-radius: 8px; border: 1px dashed var(--border);">Your wishlist is empty. Add items you plan to invest in or buy.</div>';
            } else {
              const categoryColors = {
                "Invest Into": "var(--primary)",
                "To Be Bought": "var(--success)",
                Others: "var(--muted)",
              };

              wishlistGrid.innerHTML = Store.wishlist
                .map(
                  (item) => `
                            <div class="card col-4" style="opacity: ${item.status === "Completed" ? "0.6" : "1"}; transition: opacity 0.2s;">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                                    <div class="risk-badge" style="background: ${categoryColors[item.category]}20; color: ${categoryColors[item.category]}; border-color: ${categoryColors[item.category]}40;">
                                        ${item.category}
                                    </div>
                                    <div style="display: flex; gap: 8px;">
                                        <button class="icon-btn" onclick="toggleWishlistStatus(${item.id})" title="Mark as ${item.status === "Pending" ? "Completed" : "Pending"}">
                                            <i data-lucide="${item.status === "Completed" ? "check-circle-2" : "circle"}" style="color: ${item.status === "Completed" ? "var(--success)" : "var(--muted)"}"></i>
                                        </button>
                                        <button class="icon-btn" onclick="deleteWishlistItem(${item.id})" title="Delete">
                                            <i data-lucide="trash-2" style="color: var(--danger)"></i>
                                        </button>
                                    </div>
                                </div>
                                <div style="font-weight: 700; font-size: 1.1rem; margin-bottom: 4px; text-decoration: ${item.status === "Completed" ? "line-through" : "none"};">${item.name}</div>
                                <div style="font-family: var(--font-mono); font-size: 1.25rem; color: var(--text); margin-bottom: 12px;">
                                    $${(item.amount || 0).toLocaleString()}
                                </div>
                                ${item.notes ? `<div style="font-size: 0.85rem; color: var(--muted); margin-bottom: 12px; line-height: 1.4;">${item.notes}</div>` : ""}
                                <div style="font-size: 0.75rem; color: var(--muted); display: flex; align-items: center; gap: 4px;">
                                    <i data-lucide="calendar" style="width: 12px; height: 12px;"></i> Added ${item.dateAdded}
                                </div>
                            </div>
                        `,
                )
                .join("");
            }
          }
        } catch (e) {
          console.error("Error in wishlist render:", e);
        }

        updateCharts();
        updateRiskEngine();
        lucide.createIcons();
      }

      function renderTable(id, data, template) {
        const tbody = document.querySelector(`#${id} tbody`);
        if (!tbody) return;
        tbody.innerHTML = data.map(template).join("");
      }

      function updateTradeCharts() {
        const equityCtx = document.getElementById("tradeEquityChart");
        const gradeCtx = document.getElementById("tradeGradeChart");
        const assetCtx = document.getElementById("tradeAssetChart");
        const modelCtx = document.getElementById("tradeModelChart");
        if (!equityCtx || !gradeCtx) return;

        if (window.tradeEquityObj) window.tradeEquityObj.destroy();
        if (window.tradeGradeObj) window.tradeGradeObj.destroy();
        if (window.tradeAssetObj) window.tradeAssetObj.destroy();
        if (window.tradeModelObj) window.tradeModelObj.destroy();

        // Detailed Performance Tables
        function renderPerfTable(groupKey, elementId) {
          const groups = {};
          Store.trades.forEach((t) => {
            const key = t[groupKey] || "Unknown";
            if (!groups[key]) groups[key] = { wins: 0, total: 0, r: 0 };
            groups[key].total++;
            if (t.r > 0) groups[key].wins++;
            groups[key].r += t.r;
          });

          const sortedKeys = Object.keys(groups).sort(
            (a, b) => groups[b].r - groups[a].r,
          );
          const tbody = document.getElementById(elementId);
          if (tbody) {
            tbody.innerHTML = sortedKeys
              .map((k) => {
                const g = groups[k];
                const winrate =
                  g.total > 0 ? ((g.wins / g.total) * 100).toFixed(1) : 0;
                const rColor = g.r >= 0 ? "var(--success)" : "var(--danger)";
                return `<tr>
                            <td>${k}</td>
                            <td>${winrate}%</td>
                            <td style="color: ${rColor}; font-weight: 600;">${g.r > 0 ? "+" : ""}${g.r.toFixed(2)}R</td>
                        </tr>`;
              })
              .join("");
          }
        }

        renderPerfTable("asset", "perf-table-asset");
        renderPerfTable("session", "perf-table-session");
        renderPerfTable("model", "perf-table-model");
        
        // Custom render for News Impact
        const newsGroups = {
          "News Trade": { wins: 0, total: 0, r: 0 },
          "Non-News Trade": { wins: 0, total: 0, r: 0 }
        };
        Store.trades.forEach((t) => {
          const key = t.isNewsTrade ? "News Trade" : "Non-News Trade";
          newsGroups[key].total++;
          if (t.r > 0) newsGroups[key].wins++;
          newsGroups[key].r += t.r;
        });
        const newsTbody = document.getElementById("perf-table-news");
        if (newsTbody) {
          newsTbody.innerHTML = Object.keys(newsGroups)
            .sort((a, b) => newsGroups[b].r - newsGroups[a].r)
            .map((k) => {
              const g = newsGroups[k];
              const winrate = g.total > 0 ? ((g.wins / g.total) * 100).toFixed(1) : 0;
              const rColor = g.r >= 0 ? "var(--success)" : "var(--danger)";
              return `<tr>
                          <td>${k}</td>
                          <td>${winrate}%</td>
                          <td style="color: ${rColor}; font-weight: 600;">${g.r > 0 ? "+" : ""}${g.r.toFixed(2)}R</td>
                      </tr>`;
            })
            .join("");
        }

        // Equity Curve Data
        const sortedTrades = [...Store.trades].sort(
          (a, b) => new Date(a.date) - new Date(b.date),
        );
        let cumulativeR = 0;
        const equityData = sortedTrades.map((t) => {
          cumulativeR += t.r;
          return cumulativeR;
        });
        const labels = sortedTrades.map((t) => t.date);

        window.tradeEquityObj = new Chart(equityCtx.getContext("2d"), {
          type: "line",
          data: {
            labels: labels.length ? labels : ["No Trades"],
            datasets: [
              {
                label: "Cumulative R",
                data: equityData.length ? equityData : [0],
                borderColor: "#3b82f6",
                backgroundColor: "rgba(59, 130, 246, 0.1)",
                fill: true,
                tension: 0.4,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              y: { grid: { color: "rgba(255,255,255,0.05)" } },
              x: { grid: { display: false } },
            },
          },
        });

        // Grade Distribution Data
        const grades = { "A+": 0, A: 0, B: 0, C: 0 };
        Store.trades.forEach((t) => {
          if (grades[t.grade] !== undefined) grades[t.grade]++;
        });

        window.tradeGradeObj = new Chart(gradeCtx.getContext("2d"), {
          type: "doughnut",
          data: {
            labels: Object.keys(grades),
            datasets: [
              {
                data: Object.values(grades),
                backgroundColor: ["#10b981", "#3b82f6", "#f59e0b", "#f43f5e"],
                borderWidth: 0,
              },
            ],
          },
          options: {
            cutout: "70%",
            plugins: {
              legend: {
                position: "bottom",
                labels: { color: "#71717a", usePointStyle: true },
              },
            },
          },
        });

        // Asset Breakdown
        const assets = {};
        Store.trades.forEach((t) => {
          if (t.asset) assets[t.asset] = (assets[t.asset] || 0) + t.r;
        });
        const assetLabels = Object.keys(assets);
        const assetData = Object.values(assets);

        if (assetCtx) {
          window.tradeAssetObj = new Chart(assetCtx.getContext("2d"), {
            type: "bar",
            data: {
              labels: assetLabels.length ? assetLabels : ["None"],
              datasets: [
                {
                  label: "Total R",
                  data: assetData.length ? assetData : [0],
                  backgroundColor: assetData.map((v) =>
                    v >= 0 ? "#10b981" : "#f43f5e",
                  ),
                  borderRadius: 4,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                y: { grid: { color: "rgba(255,255,255,0.05)" } },
                x: { grid: { display: false } },
              },
            },
          });
        }

        // Model Breakdown
        const models = {};
        Store.trades.forEach((t) => {
          if (t.model) models[t.model] = (models[t.model] || 0) + t.r;
        });
        const modelLabels = Object.keys(models);
        const modelData = Object.values(models);

        if (modelCtx) {
          window.tradeModelObj = new Chart(modelCtx.getContext("2d"), {
            type: "bar",
            data: {
              labels: modelLabels.length ? modelLabels : ["None"],
              datasets: [
                {
                  label: "Total R",
                  data: modelData.length ? modelData : [0],
                  backgroundColor: modelData.map((v) =>
                    v >= 0 ? "#3b82f6" : "#f43f5e",
                  ),
                  borderRadius: 4,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                y: { grid: { color: "rgba(255,255,255,0.05)" } },
                x: { grid: { display: false } },
              },
            },
          });
        }
      }

      function updateCharts() {
        try {
          // Distribution Chart (Asset Class)
          const distCanvas = document.getElementById("distChart");
          if (distCanvas) {
            const distCtx = distCanvas.getContext("2d");
            if (window.distChartObj) window.distChartObj.destroy();

            const distribution = {};
            Store.accounts.forEach((a) => {
              const key = a.assetClass || "Forex";
              distribution[key] = (distribution[key] || 0) + (a.balance || 0);
            });

            window.distChartObj = new Chart(distCtx, {
              type: "doughnut",
              data: {
                labels: Object.keys(distribution),
                datasets: [
                  {
                    data: Object.values(distribution),
                    backgroundColor: [
                      "#3b82f6",
                      "#10b981",
                      "#f59e0b",
                      "#f43f5e",
                      "#8b5cf6",
                    ],
                    borderWidth: 0,
                  },
                ],
              },
              options: {
                cutout: "70%",
                plugins: {
                  legend: {
                    position: "bottom",
                    labels: { color: "#71717a", usePointStyle: true },
                  },
                },
              },
            });
          }

          // Equity Chart
          const equityCanvas = document.getElementById("equityChart");
          if (equityCanvas) {
            const equityCtx = equityCanvas.getContext("2d");
            if (window.equityChartObj) window.equityChartObj.destroy();

            // Aggregate history from all accounts
            const dateMap = {};
            Store.accounts.forEach((acc) => {
              if (acc.history && Array.isArray(acc.history)) {
                acc.history.forEach((h, i) => {
                  if (typeof h === "number") {
                    const fallbackDate = new Date(
                      Date.now() - (acc.history.length - i) * 86400000,
                    )
                      .toISOString()
                      .split("T")[0];
                    dateMap[fallbackDate] = (dateMap[fallbackDate] || 0) + h;
                  } else if (h.date && h.balance !== undefined) {
                    dateMap[h.date] = (dateMap[h.date] || 0) + h.balance;
                  }
                });
              }
            });

            let labels = Object.keys(dateMap).sort();
            let history = labels.map((date) => dateMap[date]);

            // Fallback if no history exists
            if (labels.length === 0) {
              labels = [new Date().toISOString().split("T")[0]];
              history = [
                Store.accounts.reduce((sum, a) => sum + (a.balance || 0), 0),
              ];
            }

            // Calculate Drawdown
            let peak = -Infinity;
            const drawdownData = history.map((val) => {
              if (val > peak) peak = val;
              return peak - val;
            });

            window.equityChartObj = new Chart(equityCtx, {
              type: "line",
              data: {
                labels,
                datasets: [
                  {
                    label: "Portfolio Growth",
                    data: history,
                    borderColor: "#10b981",
                    backgroundColor: "rgba(16, 185, 129, 0.1)",
                    fill: true,
                    tension: 0.4,
                    zIndex: 2,
                  },
                  {
                    label: "Drawdown Area",
                    data: history.map((val, i) => ({
                      x: labels[i],
                      y: val,
                      y0: history[i] + drawdownData[i],
                    })),
                    hidden: true,
                  },
                ],
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label: function (context) {
                        let label = context.dataset.label || "";
                        if (label) label += ": ";
                        if (context.parsed.y !== null) {
                          label += context.parsed.y + "%";
                          const dd = drawdownData[context.dataIndex];
                          if (dd > 0) label += ` (DD: -${dd.toFixed(1)}%)`;
                        }
                        return label;
                      },
                    },
                  },
                },
                scales: {
                  y: {
                    grid: { color: "#27272a" },
                    ticks: {
                      color: "#71717a",
                      callback: (value) => value + "%",
                    },
                  },
                  x: { grid: { display: false }, ticks: { color: "#71717a" } },
                },
              },
            });

            // To actually shade the drawdown, we can add a dataset that represents the "Peak"
            // and use the 'fill' property to fill down to the 'Portfolio Growth' dataset.
            const peakData = [];
            let currentPeak = -Infinity;
            history.forEach((val) => {
              if (val > currentPeak) currentPeak = val;
              peakData.push(currentPeak);
            });

            window.equityChartObj.data.datasets.push({
              label: "Peak High",
              data: peakData,
              borderColor: "transparent",
              pointRadius: 0,
              fill: "-1", // Fill to the previous dataset (Portfolio Growth)
              backgroundColor: "rgba(244, 63, 94, 0.15)", // Danger color for drawdown
              tension: 0.4,
              zIndex: 1,
            });
            window.equityChartObj.update();
          }
        } catch (e) {
          console.error("Error in updateCharts:", e);
        }
      }

      // Initialize
      window.livePrices = {};

      // --- Live Ticker Logic ---
      async function fetchLivePrices() {
        const tickerEl = document.getElementById("live-ticker");
        if (!tickerEl) return;

        try {
          // Using Binance API for major crypto pairs as a proxy for live data
          const symbols = '["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT"]';
          const response = await fetch(
            `https://api.binance.com/api/v3/ticker/24hr?symbols=${symbols}`,
          );
          const data = await response.json();

          let html = "";
          data.forEach((item) => {
            const symbol = item.symbol.replace("USDT", "");
            const price = parseFloat(item.lastPrice);
            window.livePrices[symbol] = price;
            const priceStr = price.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
            const change = parseFloat(item.priceChangePercent);
            const color = change >= 0 ? "var(--success)" : "var(--danger)";
            const sign = change >= 0 ? "+" : "";

            html += `
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-weight: 600;">${symbol}</span>
                            <span>$${priceStr}</span>
                            <span style="color: ${color}">${sign}${change.toFixed(2)}%</span>
                        </div>
                    `;
          });

          // Fetch real XAUUSD price from gold-api.com
          try {
            const goldResponse = await fetch(
              "https://api.gold-api.com/price/XAU",
            );
            const goldData = await goldResponse.json();
            const goldPrice = parseFloat(goldData.price);

            if (!isNaN(goldPrice)) {
              let changePct = 0;
              if (window.livePrices["XAUUSD"]) {
                changePct =
                  ((goldPrice - window.livePrices["XAUUSD"]) /
                    window.livePrices["XAUUSD"]) *
                  100;
              }
              window.livePrices["XAUUSD"] = goldPrice;

              const priceStr = goldPrice.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              });
              const color = changePct >= 0 ? "var(--success)" : "var(--danger)";
              const sign = changePct >= 0 ? "+" : "";

              html += `
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-weight: 600;">XAUUSD</span>
                                <span>$${priceStr}</span>
                                <span style="color: ${color}">${sign}${changePct.toFixed(2)}%</span>
                            </div>
                        `;
            }
          } catch (goldError) {
            console.error("Failed to fetch gold price:", goldError);
          }

          tickerEl.innerHTML = html;
          if (typeof renderInvestments === "function") renderInvestments();
        } catch (error) {
          console.error("Failed to fetch live prices:", error);
          tickerEl.innerHTML =
            '<div style="color: var(--danger);">Live feed unavailable</div>';
        }
      }

      window.onload = async () => {
        try {
          fetchLivePrices();
          setInterval(fetchLivePrices, 60000); // Update every minute

          let storedHash = null;
          let isAuthenticated = null;
          try {
            storedHash = localStorage.getItem("qe_password_hash");
            isAuthenticated = sessionStorage.getItem("qe_authenticated");
          } catch (e) {
            console.error("Storage access error:", e);
          }

          if (!storedHash) {
            document.getElementById("lock-title").innerText = "Create Password";
            document.getElementById("lock-desc").innerText =
              "Set a secure main password and a secondary recovery password for your first session.";
            document.getElementById("lock-btn").innerText =
              "Set Passwords & Enter";
            document.getElementById("secondary-password-group").style.display =
              "block";
            document.getElementById("forgot-password-link").style.display =
              "none";
          } else if (isAuthenticated) {
            unlockApp();
            startLiveSimulation();
          }

          // Handle Enter key on password input
          document
            .getElementById("lock-password")
            .addEventListener("keypress", (e) => {
              if (e.key === "Enter") handleAuth();
            });
          document
            .getElementById("lock-secondary-password")
            .addEventListener("keypress", (e) => {
              if (e.key === "Enter") handleAuth();
            });
          document
            .getElementById("recovery-password")
            .addEventListener("keypress", (e) => {
              if (e.key === "Enter") handleRecovery();
            });

          lucide.createIcons();
          updateAllocPreview();
          runSimulation();

          // Sync tabs
          window.addEventListener("storage", (e) => {
            if (e.key && e.key.startsWith("qe_")) {
              Object.keys(Store).forEach((key) => {
                if (key !== "save" && typeof Store[key] !== "function") {
                  Store[key] = getLocal(key, Store[key]);
                }
              });
              renderAll();
            }
          });
        } catch (error) {
          console.error("Critical error during initialization:", error);
          alert(
            "A critical error occurred during startup. Please try resetting the system.",
          );
        }
      };

      // --- Theme Toggle Logic ---
      window.toggleTheme = function () {
        const currentTheme =
          document.documentElement.getAttribute("data-theme") || "dark";
        const newTheme = currentTheme === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", newTheme);
        localStorage.setItem("qe_theme", newTheme);

        const icon = document.getElementById("theme-icon");
        const text = document.getElementById("theme-text");
        if (newTheme === "light") {
          icon.setAttribute("data-lucide", "moon");
          text.innerText = "Dark Mode";
        } else {
          icon.setAttribute("data-lucide", "sun");
          text.innerText = "Light Mode";
        }
        lucide.createIcons();
      };

      // Apply theme on load
      const savedTheme = localStorage.getItem("qe_theme") || "dark";
      document.documentElement.setAttribute("data-theme", savedTheme);
      window.addEventListener("DOMContentLoaded", () => {
        const icon = document.getElementById("theme-icon");
        const text = document.getElementById("theme-text");
        if (savedTheme === "light") {
          icon.setAttribute("data-lucide", "moon");
          text.innerText = "Dark Mode";
        } else {
          icon.setAttribute("data-lucide", "sun");
          text.innerText = "Light Mode";
        }
        lucide.createIcons();

        // Initialize Sortable Dashboard
        const grid = document.getElementById("dashboard-grid");
        if (grid) {
          new Sortable(grid, {
            animation: 150,
            ghostClass: "sortable-ghost",
            onEnd: function () {
              const order = Array.from(grid.children).map((el) =>
                el.getAttribute("data-id"),
              );
              Store.settings.dashboardOrder = order;
              Store.save();
            },
          });

          // Apply saved order
          const savedOrder = Store.settings.dashboardOrder;
          if (savedOrder && Array.isArray(savedOrder)) {
            const items = Array.from(grid.children);
            savedOrder.forEach((id) => {
              const item = items.find(
                (el) => el.getAttribute("data-id") === id,
              );
              if (item) grid.appendChild(item);
            });
          }
        }
      });
    