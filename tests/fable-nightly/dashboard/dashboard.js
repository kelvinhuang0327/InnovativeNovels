(function () {
  "use strict";

  var DASHBOARD_DATA_SCHEMA = "fable-nightly-dashboard-data/v1";
  var BUILD_COMMAND = "node bin/fable-nightly.mjs dashboard --project projects/innovative-novels/project.yaml --format json";

  function el(tag, options, children) {
    var node = document.createElement(tag);
    options = options || {};
    if (options.className) node.className = options.className;
    if (options.text !== undefined && options.text !== null) node.textContent = String(options.text);
    if (options.attrs) {
      for (var key in options.attrs) {
        if (Object.prototype.hasOwnProperty.call(options.attrs, key)) node.setAttribute(key, options.attrs[key]);
      }
    }
    (children || []).forEach(function (child) {
      if (child) node.appendChild(child);
    });
    return node;
  }

  function fmt(value, fallback) {
    if (value === null || value === undefined) return fallback === undefined ? "unknown" : fallback;
    return String(value);
  }

  function fmtBool(value) {
    if (value === null || value === undefined) return "unknown";
    return value ? "yes" : "no";
  }

  function fmtDuration(ms) {
    if (typeof ms !== "number" || Number.isNaN(ms)) return "unknown";
    if (ms < 1000) return ms + "ms";
    return (ms / 1000).toFixed(2) + "s";
  }

  function isValidDashboardData(data) {
    return !!data &&
      typeof data === "object" &&
      data.schema === DASHBOARD_DATA_SCHEMA &&
      typeof data.project === "object" &&
      typeof data.nightly === "object" &&
      typeof data.pre_triage === "object" &&
      typeof data.authority === "object" &&
      typeof data.freshness === "object" &&
      Array.isArray(data.warnings) &&
      Array.isArray(data.evidence);
  }

  function renderUnavailable(root, reason) {
    root.textContent = "";
    root.appendChild(el("div", { className: "unavailable-state" }, [
      el("h1", { text: "DASHBOARD_DATA_UNAVAILABLE" }),
      el("p", { text: "The generated nightly-data.js projection is missing or malformed." }),
      el("p", { text: reason }),
      el("p", { text: "Rebuild it with:" }),
      el("pre", { text: BUILD_COMMAND }),
      el("p", { className: "empty-state", text: "This page never falls back to hardcoded success values." })
    ]));
  }

  function copyToClipboard(value, feedbackEl, label) {
    function report(ok) {
      feedbackEl.textContent = ok ? ((label || "Value") + " copied to clipboard.") : ((label || "Value") + " could not be copied — select and copy manually.");
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(function () { report(true); }, function () { fallbackCopy(); });
    } else {
      fallbackCopy();
    }
    function fallbackCopy() {
      try {
        var textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, value.length);
        var ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        report(!!ok);
      } catch (error) {
        report(false);
      }
    }
  }

  function copyButton(value, label, feedbackEl) {
    var button = el("button", { text: "Copy " + label, attrs: { type: "button" } });
    button.addEventListener("click", function () {
      copyToClipboard(value, feedbackEl, label);
    });
    return button;
  }

  function card(label, value, tone) {
    return el("div", { className: "card" }, [
      el("span", { className: "card-label", text: label }),
      el("span", { className: "card-value" + (tone ? " " + tone : ""), text: value })
    ]);
  }

  function renderHeader(root, data, feedbackEl) {
    var header = el("header", { className: "dashboard-header" });
    header.appendChild(el("h1", { text: data.project.project_name + " — Nightly Status" }));
    var meta = el("dl", { className: "header-meta" });
    var rows = [
      ["Project ID", data.project.project_id],
      ["Nightly run", data.nightly.run_id],
      ["Nightly status", data.nightly.status],
      ["Generated", data.generated_at],
      ["Generator", data.generator_version]
    ];
    rows.forEach(function (pair) {
      meta.appendChild(el("div", {}, [
        el("dt", { text: pair[0] + ":" }),
        el("dd", { text: fmt(pair[1]) })
      ]));
    });
    header.appendChild(meta);
    var buildRow = el("div");
    buildRow.appendChild(copyButton(BUILD_COMMAND, "Dashboard Build Command", feedbackEl));
    header.appendChild(buildRow);
    root.appendChild(header);
  }

  function renderOverview(root, data) {
    var section = el("section", {}, [el("h2", { text: "Overview" })]);
    var n = data.nightly;
    var blockedNotRun = (typeof n.tests_blocked === "number" && typeof n.tests_not_run === "number")
      ? (n.tests_blocked + n.tests_not_run)
      : null;
    var grid = el("div", { className: "card-grid" }, [
      card("Tests passed", n.test_totals_known ? fmt(n.tests_passed) : "unknown", n.test_totals_known && n.tests_passed > 0 ? "good" : ""),
      card("Tests failed", n.test_totals_known ? fmt(n.tests_failed) : "unknown", n.test_totals_known && n.tests_failed > 0 ? "bad" : (n.test_totals_known ? "good" : "")),
      card("Blocked / not run", blockedNotRun === null ? "unknown" : fmt(blockedNotRun), blockedNotRun ? "warn" : ""),
      card("Actionable candidates", data.pre_triage.available ? fmt(data.pre_triage.actionable_candidates) : "unknown", data.pre_triage.available && data.pre_triage.actionable_candidates > 0 ? "warn" : ""),
      card("Repair Packet drafts", data.pre_triage.available ? fmt(data.pre_triage.repair_packet_drafts) : "unknown", ""),
      card("Closure eligible", fmtBool(data.authority.eligible_for_defect_closure), data.authority.eligible_for_defect_closure ? "good" : "warn")
    ]);
    section.appendChild(grid);
    root.appendChild(section);
  }

  function renderAuthorityBanner(root, data) {
    var eligible = data.authority.eligible_for_defect_closure === true;
    var banner = el("div", { className: "authority-banner " + (eligible ? "eligible" : "not-eligible") });
    banner.setAttribute("role", "note");
    if (eligible) {
      banner.appendChild(el("p", { text: "This run is eligible for defect-closure authority." }));
    } else {
      banner.appendChild(el("p", { text: "This run can be used for observation and investigation, but it is not eligible to close defects." }));
    }
    var caveats = data.authority.caveats || [];
    if (caveats.length > 0) {
      var list = el("ul");
      caveats.forEach(function (caveat) {
        list.appendChild(el("li", { text: caveat }));
      });
      banner.appendChild(el("p", { text: "Authority caveats:" }));
      banner.appendChild(list);
    }
    root.appendChild(banner);
  }

  function renderRunDetails(root, data) {
    var section = el("section", {}, [el("h2", { text: "Run details" })]);
    var n = data.nightly;
    var p = data.project;
    var f = data.freshness;
    var rows = [
      ["Canonical branch", p.canonical_branch],
      ["Current branch", p.current_branch],
      ["Source HEAD", n.source_head],
      ["Current HEAD", p.current_head],
      ["HEAD matches current", fmtBool(f.source_head_matches_current_head)],
      ["Source tree", n.source_tree],
      ["Current tree", p.current_tree],
      ["Tree matches current", fmtBool(f.source_tree_matches_current_tree)],
      ["Command", n.command_executable + " " + (Array.isArray(n.command_argv) ? n.command_argv.join(" ") : "")],
      ["Exit code", fmt(n.exit_code)],
      ["Duration", fmtDuration(n.duration_ms)],
      ["Started at", fmt(n.started_at)],
      ["Finished at", fmt(n.finished_at)]
    ];
    var wrap = el("div", { className: "table-scroll" });
    var table = el("table");
    var tbody = el("tbody");
    rows.forEach(function (pair) {
      tbody.appendChild(el("tr", {}, [
        el("th", { attrs: { scope: "row" }, text: pair[0] }),
        el("td", { text: pair[1] })
      ]));
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    section.appendChild(wrap);
    if (f.dashboard_data_stale) {
      var stale = el("p", { className: "empty-state" }, [
        document.createTextNode("Stale: " + (f.stale_reasons || []).join(", "))
      ]);
      section.appendChild(stale);
    }
    root.appendChild(section);
  }

  function renderPreTriage(root, data) {
    var section = el("section", {}, [el("h2", { text: "Pre-triage" })]);
    var pt = data.pre_triage;
    if (!pt.available) {
      section.appendChild(el("p", { className: "empty-state", text: "No pre-triage result is available for the current nightly run." }));
      root.appendChild(section);
      return;
    }
    var rows = [
      ["Status", pt.status],
      ["Source run", pt.source_run_id],
      ["Candidate groups", fmt(pt.candidate_groups)],
      ["Actionable candidates", fmt(pt.actionable_candidates)],
      ["Repair Packet drafts", fmt(pt.repair_packet_drafts)],
      ["Repair Packet overflow", fmt(pt.overflow_count)],
      ["Highest suggested priority", fmt(pt.highest_suggested_priority, "none")]
    ];
    var wrap = el("div", { className: "table-scroll" });
    var table = el("table");
    var tbody = el("tbody");
    rows.forEach(function (pair) {
      tbody.appendChild(el("tr", {}, [
        el("th", { attrs: { scope: "row" }, text: pair[0] }),
        el("td", { text: pair[1] })
      ]));
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    section.appendChild(wrap);
    if (!pt.actionable_candidates) {
      section.appendChild(el("p", { className: "empty-state", text: "No actionable failures were found in this run." }));
    }
    root.appendChild(section);
  }

  function renderCandidates(root, data, feedbackEl) {
    var section = el("section", {}, [el("h2", { text: "Candidates" })]);
    var pt = data.pre_triage;
    var candidates = Array.isArray(pt.candidates) ? pt.candidates : [];
    if (candidates.length === 0) {
      section.appendChild(el("p", { className: "empty-state", text: "No actionable failures were found in this run." }));
      root.appendChild(section);
      return;
    }
    candidates.forEach(function (candidate) {
      var candidateCard = el("div", { className: "card" });
      candidateCard.appendChild(el("p", { text: "Candidate: " + fmt(candidate.candidate_id) }));
      candidateCard.appendChild(el("p", { text: "Classification: " + fmt(candidate.classification) + " (" + fmt(candidate.confidence) + ")" }));
      candidateCard.appendChild(el("p", { text: "Suggested priority: " + fmt(candidate.suggested_priority) }));
      candidateCard.appendChild(el("p", { text: "Fingerprint: " + fmt(candidate.fingerprint) }));
      candidateCard.appendChild(el("pre", { text: fmt(candidate.first_load_bearing_error) }));
      if (Array.isArray(candidate.authority_caveats) && candidate.authority_caveats.length > 0) {
        candidateCard.appendChild(el("p", { text: "Authority caveats: " + candidate.authority_caveats.join(", ") }));
      }
      // A repair draft is only ever rendered when the read model actually carries one; the
      // authorization_status shown always comes from that data, never assumed by this page.
      if (candidate.repair_packet && typeof candidate.repair_packet === "object") {
        var packet = candidate.repair_packet;
        candidateCard.appendChild(el("p", { text: "Repair Packet authorization_status: " + fmt(packet.authorization_status) }));
        candidateCard.appendChild(copyButton(JSON.stringify(packet, null, 2), "Repair Draft", feedbackEl));
      }
      section.appendChild(candidateCard);
    });
    root.appendChild(section);
  }

  function renderEvidence(root, data, feedbackEl) {
    var section = el("section", {}, [el("h2", { text: "Evidence" })]);
    var wrap = el("div", { className: "table-scroll" });
    var table = el("table");
    var thead = el("thead", {}, [
      el("tr", {}, [
        el("th", { text: "Label" }),
        el("th", { text: "Type" }),
        el("th", { text: "Path" }),
        el("th", { text: "Source" }),
        el("th", { text: "" })
      ])
    ]);
    table.appendChild(thead);
    var tbody = el("tbody");
    (data.evidence || []).forEach(function (item) {
      var row = el("tr", {}, [
        el("td", { text: item.label }),
        el("td", { text: item.type }),
        el("td", { text: item.absolute_path }),
        el("td", { text: fmt(item.source_id) })
      ]);
      var actionCell = el("td");
      actionCell.appendChild(copyButton(item.absolute_path, "Path", feedbackEl));
      row.appendChild(actionCell);
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    section.appendChild(wrap);
    root.appendChild(section);
  }

  function renderWarnings(root, data) {
    var warnings = data.warnings || [];
    var section = el("section", {}, [el("h2", { text: "Warnings" })]);
    if (warnings.length === 0) {
      section.appendChild(el("p", { className: "empty-state", text: "No warnings were raised while building this Dashboard." }));
      root.appendChild(section);
      return;
    }
    var list = el("ul", { className: "warning-list" });
    warnings.forEach(function (warning) {
      var severity = (warning.severity || "WARNING").toLowerCase();
      var item = el("li", { className: "warning-item severity-" + severity }, [
        el("strong", { text: warning.code + ": " }),
        document.createTextNode(warning.message)
      ]);
      if (warning.evidence_path) {
        item.appendChild(el("div", { text: warning.evidence_path }));
      }
      list.appendChild(item);
    });
    section.appendChild(list);
    root.appendChild(section);
  }

  function render(root, data) {
    root.textContent = "";
    var feedback = el("div", { className: "copy-feedback", attrs: { "aria-live": "polite", role: "status" } });
    renderHeader(root, data, feedback);
    renderOverview(root, data);
    renderAuthorityBanner(root, data);
    renderRunDetails(root, data);
    renderPreTriage(root, data);
    renderCandidates(root, data, feedback);
    renderEvidence(root, data, feedback);
    renderWarnings(root, data);
    root.appendChild(feedback);
  }

  function main() {
    var root = document.getElementById("dashboard-root");
    if (!root) return;
    var data = window.FABLE_NIGHTLY_DATA;
    if (!isValidDashboardData(data)) {
      renderUnavailable(root, "window.FABLE_NIGHTLY_DATA was not found, or does not match the expected schema.");
      return;
    }
    try {
      render(root, data);
    } catch (error) {
      renderUnavailable(root, "Rendering failed: " + (error && error.message ? error.message : "unknown error"));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
