import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RULES_PATH = path.join(__dirname, '../../config/rules.json');

let rulesCache = null;

/**
 * Load rules from config file
 */
function loadRules() {
  if (rulesCache) return rulesCache;

  const rulesData = JSON.parse(fs.readFileSync(RULES_PATH, 'utf-8'));
  rulesCache = rulesData;
  return rulesCache;
}

/**
 * Get ignore rules
 */
function getIgnoreRules() {
  const data = loadRules();
  return data.ignore_rules || {};
}

/**
 * Check if email should be ignored based on sender
 */
function shouldIgnoreSender(emailFrom) {
  const ignoreRules = getIgnoreRules();
  const ignoreSenders = ignoreRules.ignore_senders || [];
  
  const lowerFrom = emailFrom.toLowerCase();
  return ignoreSenders.some((sender) =>
    lowerFrom.includes(sender.toLowerCase())
  );
}

/**
 * Check if email should be ignored based on subject
 */
function shouldIgnoreBySubject(emailSubject) {
  const ignoreRules = getIgnoreRules();
  const ignoreSubjects = ignoreRules.ignore_subject_contains || [];
  
  const lowerSubject = emailSubject.toLowerCase();
  return ignoreSubjects.some((phrase) =>
    lowerSubject.includes(phrase.toLowerCase())
  );
}

/**
 * Check if email should be ignored overall
 */
export function shouldIgnoreEmail(email) {
  if (shouldIgnoreSender(email.from)) {
    return true;
  }
  
  if (shouldIgnoreBySubject(email.subject)) {
    return true;
  }
  
  return false;
}

/**
 * Check if email body contains any of the keywords
 */
function checkKeywordMatch(emailBody, keywords, mustMatch = 'any') {
  const lowerBody = emailBody.toLowerCase();

  if (mustMatch === 'all') {
    return keywords.every((keyword) =>
      lowerBody.includes(keyword.toLowerCase())
    );
  }

  // Default: 'any'
  return keywords.some((keyword) =>
    lowerBody.includes(keyword.toLowerCase())
  );
}

/**
 * Evaluate if an email matches a rule
 */
function evaluateRule(rule, email) {
  if (!rule.enabled) return false;

  const { conditions } = rule;

  // Check keywords in subject and body
  if (conditions.keywords && conditions.keywords.length > 0) {
    const emailContent = `${email.subject} ${email.body}`;
    return checkKeywordMatch(
      emailContent,
      conditions.keywords,
      conditions.mustMatch
    );
  }

  return false;
}

/**
 * Get matching rules for an email
 */
export function getMatchingRules(email) {
  const data = loadRules();
  const rules = data.rules || [];
  return rules.filter((rule) => evaluateRule(rule, email));
}

/**
 * Check if email should be processed (has matching rules and not ignored)
 */
export function shouldProcessEmail(email) {
  if (shouldIgnoreEmail(email)) {
    return false;
  }
  
  const matchingRules = getMatchingRules(email);
  return matchingRules.length > 0;
}

/**
 * Build context string from matching rules
 */
export function buildContextFromRules(email) {
  const matchingRules = getMatchingRules(email);

  if (matchingRules.length === 0) {
    return 'This is an email message';
  }

  const contexts = matchingRules.map((rule) => rule.context).join('. ');
  return contexts;
}

/**
 * Reload rules from file (useful for hot-reloading)
 */
export function reloadRules() {
  rulesCache = null;
  return loadRules();
}
