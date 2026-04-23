(function () {
  function countMatches(text, regex) {
    var matches = String(text || "").match(regex);
    return matches ? matches.length : 0;
  }

  function collectMatches(text, regex) {
    var out = [];
    var source = String(text || "");
    var match;
    while ((match = regex.exec(source)) !== null) {
      out.push(match[0]);
    }
    return out;
  }

  function uniqueCompact(list) {
    return Array.from(new Set((list || []).filter(Boolean).map(function (item) {
      return String(item).trim();
    }))).filter(Boolean);
  }

  function detectPrimaryLanguageByScript(text) {
    text = String(text || "");
    var counts = {
      bengali: countMatches(text, /[\u0980-\u09FF]/g),
      arabic: countMatches(text, /[\u0600-\u06FF]/g),
      devanagari: countMatches(text, /[\u0900-\u097F]/g),
      cjk: countMatches(text, /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF]/g),
      latin: countMatches(text, /[A-Za-z]/g)
    };

    var sorted = Object.entries(counts).sort(function (a, b) { return b[1] - a[1]; });
    var active = sorted.filter(function (entry) { return entry[1] >= 6; });
    var primaryLanguage = "unknown";

    if (sorted[0] && sorted[0][1] > 0) {
      switch (sorted[0][0]) {
        case "bengali": primaryLanguage = "bengali"; break;
        case "arabic": primaryLanguage = "arabic"; break;
        case "devanagari": primaryLanguage = "hindi"; break;
        case "cjk": primaryLanguage = "cjk"; break;
        case "latin": primaryLanguage = "english"; break;
        default: primaryLanguage = "unknown";
      }
    }

    return {
      counts: counts,
      primaryLanguage: primaryLanguage,
      mixedLanguage: active.length > 1,
      activeScripts: active.map(function (entry) { return entry[0]; })
    };
  }

  function detectDenseStructure(text) {
    var normalized = String(text || "").trim();
    if (!normalized) {
      return {
        isDense: false,
        sentenceCount: 0,
        avgWordsPerSentence: 0,
        numberingHits: 0,
        clauseMarkers: 0
      };
    }

    var sentences = normalized
      .split(/[.!?।]+/)
      .map(function (part) { return part.trim(); })
      .filter(Boolean);

    var totalWords = sentences.reduce(function (sum, sentence) {
      return sum + sentence.split(/\s+/).filter(Boolean).length;
    }, 0);

    var avgWordsPerSentence = sentences.length ? totalWords / sentences.length : 0;
    var numberingHits = countMatches(normalized, /\b(?:section|sec\.|article|art\.|rule|clause|schedule)\s+\d+[A-Za-z\-]*/gi);
    var clauseMarkers = countMatches(normalized, /;/g) + countMatches(normalized, /\([a-z0-9]+\)/gi) + countMatches(normalized, /\bwhereas\b/gi) + countMatches(normalized, /\bprovided that\b/gi);

    var isDense = avgWordsPerSentence >= 24 || numberingHits >= 3 || clauseMarkers >= 5 || normalized.length >= 1200;

    return {
      isDense: isDense,
      sentenceCount: sentences.length,
      avgWordsPerSentence: Number(avgWordsPerSentence.toFixed(1)),
      numberingHits: numberingHits,
      clauseMarkers: clauseMarkers
    };
  }

  function extractProtectedPatterns(text) {
    var normalized = String(text || "");

    var quoted = uniqueCompact(
      collectMatches(normalized, /"[^"\n]{2,}"/g)
        .concat(collectMatches(normalized, /“[^”\n]{2,}”/g))
        .concat(collectMatches(normalized, /'[^'\n]{2,}'/g))
    );

    var urls = uniqueCompact(collectMatches(normalized, /https?:\/\/[^\s]+/g));
    var emails = uniqueCompact(collectMatches(normalized, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi));
    var files = uniqueCompact(collectMatches(normalized, /\b[\w,\s-]+\.(pdf|docx|xlsx|pptx|txt|csv|html|js)\b/gi));
    var sections = uniqueCompact(collectMatches(normalized, /\b(?:section|sec\.|article|art\.|rule|clause|schedule)\s+\d+[A-Za-z\-]*/gi));
    var statuteLike = uniqueCompact(collectMatches(normalized, /\b[A-Z][A-Za-z,&\-\s]{2,}(Act|Code|Ordinance|Rules|Regulations)\b/g));

    return {
      quoted: quoted,
      urls: urls,
      emails: emails,
      files: files,
      sections: sections,
      statuteLike: statuteLike
    };
  }

  function detectLanguageProfile(text) {
    var raw = String(text || "");
    var script = detectPrimaryLanguageByScript(raw);
    var dense = detectDenseStructure(raw);
    var protectedPatterns = extractProtectedPatterns(raw);

    return {
      primaryLanguage: script.primaryLanguage,
      mixedLanguage: script.mixedLanguage,
      activeScripts: script.activeScripts,
      isDense: dense.isDense,
      sentenceCount: dense.sentenceCount,
      avgWordsPerSentence: dense.avgWordsPerSentence,
      numberingHits: dense.numberingHits,
      clauseMarkers: dense.clauseMarkers,
      protectedPatterns: protectedPatterns
    };
  }

  function humanLabel(languageCode) {
    switch (languageCode) {
      case "english": return "English";
      case "bengali": return "Bengali";
      case "arabic": return "Arabic";
      case "hindi": return "Hindi";
      case "cjk": return "CJK";
      case "unknown": return "Unknown";
      default: return languageCode || "Unknown";
    }
  }

  function resolveResponseLanguage(profile, preferences) {
    var prefs = preferences || {};
    switch (prefs.responseMode) {
      case "english": return "English";
      case "bengali": return "Bengali";
      case "selected": return (prefs.customLanguage || "").trim() || humanLabel(profile.primaryLanguage);
      case "match-input":
      default: return humanLabel(profile.primaryLanguage);
    }
  }

  function buildLanguageInstructionBlock(options) {
    var text = String((options && options.text) || "");
    var preferences = (options && options.preferences) || {};
    var profile = detectLanguageProfile(text);
    var responseLanguage = resolveResponseLanguage(profile, preferences);

    var lines = [
      "LANGUAGE_AND_CONTENT_RULES",
      "- Understand the full prompt even if it mixes languages or scripts.",
      "- Do not ignore, flatten, or silently rewrite meaning from one language segment into another.",
      "- Reply in " + responseLanguage + "."
    ];

    if (preferences.preserveTerms !== false) {
      lines.push("- Preserve personal names, party names, case names, statute names, file names, email addresses, URLs, quoted text, source labels, and section/article/rule/clause numbers exactly unless the user explicitly asks for translation or transliteration.");
    }

    if (profile.mixedLanguage) {
      lines.push("- The input appears mixed-language. Resolve meaning across all language segments before answering.");
    }

    if (profile.isDense) {
      lines.push("- The input appears dense or clause-heavy. Preserve distinctions, conditions, numbering, and exceptions.");
    }

    if (preferences.clarifyDenseText) {
      lines.push("- After the faithful answer, add a clearer plain-language explanation without changing the underlying meaning.");
    }

    lines.push("- Do not silently translate quotations, citations, headings, or reference identifiers.");
    lines.push("- If a term could carry multiple jurisdictional, technical, or linguistic meanings, state the chosen reading briefly instead of hiding the ambiguity.");

    return {
      instructionText: lines.join("\n"),
      metadata: {
        detectedInputLanguage: profile.primaryLanguage,
        detectedMixedLanguage: profile.mixedLanguage,
        responseLanguage: responseLanguage,
        preserveTerms: preferences.preserveTerms !== false,
        clarifyDenseText: !!preferences.clarifyDenseText,
        denseInput: profile.isDense,
        protectedPatterns: profile.protectedPatterns
      }
    };
  }

  window.ZhuxinLanguageUnderstanding = {
    detectLanguageProfile: detectLanguageProfile,
    buildLanguageInstructionBlock: buildLanguageInstructionBlock,
    resolveResponseLanguage: resolveResponseLanguage,
    humanLabel: humanLabel
  };
})();