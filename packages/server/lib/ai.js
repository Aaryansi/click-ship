/**
 * AI Code Generation Module for Click-Ship
 *
 * Provides GPT-4 powered code modifications with design token awareness.
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const AI_MODEL = process.env.AI_MODEL || 'gpt-4-turbo-preview';

// ============================================
// System Prompts
// ============================================

const CODE_MODIFICATION_PROMPT = `You are a code modification assistant for Click-Ship, a visual editing tool for web applications.

CONTEXT:
- You receive a file's full content and a CSS selector identifying the target element
- The user describes a visual change they want (color, spacing, text, layout, etc.)
- You must return ONLY the modified code section with sufficient context

RULES:
1. Preserve all imports, exports, and component structure
2. Use the project's existing patterns:
   - If using Tailwind, use Tailwind classes
   - If using CSS modules, use existing class naming patterns
   - If using styled-components, maintain the styling approach
3. If design tokens are provided, prefer them over raw values
4. Return valid, syntactically correct code
5. Include 3-5 lines of context before and after the change for precise replacement
6. NEVER add comments explaining changes - just make the change
7. Keep modifications minimal - only change what's necessary
8. Maintain consistent formatting with the existing code

DESIGN TOKENS:
{designTokens}

OUTPUT FORMAT:
Return ONLY a JSON object with this structure:
{
  "original": "// The exact lines being replaced (for matching)",
  "modified": "// The replacement code",
  "explanation": "Brief one-line explanation of the change",
  "confidence": 0.95
}

If you cannot make the requested change, return:
{
  "error": "Explanation of why the change cannot be made",
  "confidence": 0
}`;

const SELECTOR_ANALYSIS_PROMPT = `Analyze this CSS selector and describe what element it likely targets in a React/JSX codebase.

Selector: {selector}

Consider:
- Class names may be dynamically generated (CSS modules, Tailwind)
- IDs are usually stable
- Data attributes are common for testing
- The selector might target nested elements

Respond with a brief analysis of what to search for in the codebase.`;

// ============================================
// Code Modification
// ============================================

/**
 * Generate code modification using GPT-4
 */
export async function generateCodeChange({
  fileContent,
  selector,
  description,
  designTokens = {},
  filePath
}) {
  const systemPrompt = CODE_MODIFICATION_PROMPT.replace(
    '{designTokens}',
    Object.keys(designTokens).length > 0
      ? JSON.stringify(designTokens, null, 2)
      : 'No design tokens available - use appropriate values'
  );

  const userPrompt = `File: ${filePath}

\`\`\`
${fileContent}
\`\`\`

Target Selector: ${selector}
Requested Change: ${description}

Analyze the file, find the element matching the selector, and generate the minimal code change needed.`;

  try {
    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 4000,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content;
    const result = JSON.parse(content);

    // Track token usage
    result.tokensUsed = response.usage?.total_tokens || 0;
    result.model = AI_MODEL;

    return result;
  } catch (error) {
    console.error('AI code generation error:', error);
    return {
      error: error.message,
      confidence: 0
    };
  }
}

/**
 * Generate code change with retry logic
 */
export async function generateCodeChangeWithRetry(params, maxRetries = 2) {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await generateCodeChange(params);

    if (!result.error && result.confidence >= 0.7) {
      return result;
    }

    lastError = result.error || 'Low confidence score';

    // Adjust prompt on retry
    if (attempt < maxRetries) {
      params.description = `${params.description}\n\nPrevious attempt failed: ${lastError}. Please try a different approach.`;
    }
  }

  return {
    error: lastError || 'Failed after retries',
    confidence: 0
  };
}

// ============================================
// Code Application
// ============================================

/**
 * Apply AI-generated modification to file content
 */
export function applyModification(fileContent, modification) {
  const { original, modified } = modification;

  if (!original || !modified) {
    return {
      success: false,
      error: 'Invalid modification structure'
    };
  }

  // Normalize whitespace for matching
  const normalizedOriginal = normalizeWhitespace(original);
  const normalizedContent = normalizeWhitespace(fileContent);

  if (!normalizedContent.includes(normalizedOriginal)) {
    // Try fuzzy matching
    const fuzzyMatch = findFuzzyMatch(fileContent, original);
    if (fuzzyMatch) {
      return {
        success: true,
        content: fileContent.slice(0, fuzzyMatch.start) + modified + fileContent.slice(fuzzyMatch.end)
      };
    }

    return {
      success: false,
      error: 'Could not find original code block to replace'
    };
  }

  // Exact replacement
  const newContent = fileContent.replace(original, modified);

  return {
    success: true,
    content: newContent
  };
}

/**
 * Normalize whitespace for comparison
 */
function normalizeWhitespace(str) {
  return str.replace(/\s+/g, ' ').trim();
}

/**
 * Find fuzzy match for original code
 */
function findFuzzyMatch(content, original, threshold = 0.8) {
  const lines = content.split('\n');
  const originalLines = original.split('\n');

  // Sliding window approach
  for (let i = 0; i <= lines.length - originalLines.length; i++) {
    const windowLines = lines.slice(i, i + originalLines.length);
    const similarity = calculateSimilarity(windowLines.join('\n'), original);

    if (similarity >= threshold) {
      // Calculate byte offsets
      const start = lines.slice(0, i).join('\n').length + (i > 0 ? 1 : 0);
      const end = start + windowLines.join('\n').length;

      return { start, end };
    }
  }

  return null;
}

/**
 * Calculate similarity between two strings (Levenshtein-based)
 */
function calculateSimilarity(a, b) {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Levenshtein edit distance
 */
function levenshteinDistance(a, b) {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// ============================================
// Selector Analysis
// ============================================

/**
 * Analyze selector to understand what to search for
 */
export async function analyzeSelector(selector) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo', // Use cheaper model for simple analysis
      messages: [
        {
          role: 'system',
          content: 'You analyze CSS selectors and provide search strategies for finding matching elements in React codebases. Be concise.'
        },
        {
          role: 'user',
          content: SELECTOR_ANALYSIS_PROMPT.replace('{selector}', selector)
        }
      ],
      temperature: 0.3,
      max_tokens: 500
    });

    return {
      analysis: response.choices[0].message.content,
      searchTerms: extractSearchTerms(selector)
    };
  } catch (error) {
    return {
      analysis: null,
      searchTerms: extractSearchTerms(selector)
    };
  }
}

/**
 * Extract search terms from selector
 */
function extractSearchTerms(selector) {
  const terms = [];

  // Extract class names
  const classMatches = selector.match(/\.([a-zA-Z0-9_-]+)/g);
  if (classMatches) {
    terms.push(...classMatches.map(c => c.slice(1)));
  }

  // Extract IDs
  const idMatches = selector.match(/#([a-zA-Z0-9_-]+)/g);
  if (idMatches) {
    terms.push(...idMatches.map(id => id.slice(1)));
  }

  // Extract data attributes
  const dataMatches = selector.match(/\[data-([a-zA-Z0-9_-]+)(?:=[^\]]+)?\]/g);
  if (dataMatches) {
    terms.push(...dataMatches.map(d => d.match(/data-([a-zA-Z0-9_-]+)/)[1]));
  }

  return [...new Set(terms)]; // Dedupe
}

// ============================================
// Figma Style Conversion
// ============================================

/**
 * Generate code change from Figma styles
 */
export async function generateCodeFromFigmaStyles({
  fileContent,
  selector,
  figmaStyles,
  designTokens = {},
  filePath
}) {
  // Map Figma styles to CSS/Tailwind description
  const styleDescription = mapFigmaStylesToDescription(figmaStyles, designTokens);

  return generateCodeChange({
    fileContent,
    selector,
    description: styleDescription,
    designTokens,
    filePath
  });
}

/**
 * Map Figma styles to natural language description
 */
function mapFigmaStylesToDescription(figmaStyles, designTokens) {
  const changes = [];

  // Background/Fill
  if (figmaStyles.fills && figmaStyles.fills.length > 0) {
    const fill = figmaStyles.fills[0];
    if (fill.type === 'SOLID') {
      const color = rgbToHex(fill.color);
      const tokenMatch = findColorToken(color, designTokens);
      changes.push(`Change background color to ${tokenMatch || color}`);
    }
  }

  // Border/Stroke
  if (figmaStyles.strokes && figmaStyles.strokes.length > 0) {
    const stroke = figmaStyles.strokes[0];
    if (stroke.type === 'SOLID') {
      const color = rgbToHex(stroke.color);
      const tokenMatch = findColorToken(color, designTokens);
      changes.push(`Change border color to ${tokenMatch || color}`);
    }
  }

  // Border radius
  if (figmaStyles.cornerRadius !== undefined && figmaStyles.cornerRadius > 0) {
    changes.push(`Set border radius to ${figmaStyles.cornerRadius}px`);
  }

  // Padding
  if (figmaStyles.padding) {
    const { top, right, bottom, left } = figmaStyles.padding;
    if (top === right && right === bottom && bottom === left) {
      changes.push(`Set padding to ${top}px`);
    } else {
      changes.push(`Set padding to ${top}px ${right}px ${bottom}px ${left}px`);
    }
  }

  // Effects (shadows)
  if (figmaStyles.effects && figmaStyles.effects.length > 0) {
    const shadow = figmaStyles.effects.find(e => e.type === 'DROP_SHADOW');
    if (shadow) {
      changes.push('Add drop shadow effect');
    }
  }

  return changes.join('. ');
}

/**
 * Convert RGB to hex
 */
function rgbToHex({ r, g, b }) {
  const toHex = (n) => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Find matching color token
 */
function findColorToken(hexColor, designTokens) {
  if (!designTokens.colors) return null;

  const normalizedHex = hexColor.toLowerCase();

  for (const [name, value] of Object.entries(designTokens.colors)) {
    if (typeof value === 'string' && value.toLowerCase() === normalizedHex) {
      return name;
    }
  }

  return null;
}

// ============================================
// Validation
// ============================================

/**
 * Validate generated code is syntactically correct
 */
export function validateGeneratedCode(code, language = 'jsx') {
  try {
    // Basic syntax check - try to parse as JavaScript
    new Function(code);
    return { valid: true };
  } catch (error) {
    // For JSX, parsing will fail - do basic bracket matching
    if (language === 'jsx') {
      return validateJSXSyntax(code);
    }
    return { valid: false, error: error.message };
  }
}

/**
 * Basic JSX syntax validation
 */
function validateJSXSyntax(code) {
  const brackets = { '(': ')', '[': ']', '{': '}', '<': '>' };
  const stack = [];

  for (const char of code) {
    if (brackets[char]) {
      stack.push(brackets[char]);
    } else if (Object.values(brackets).includes(char)) {
      if (stack.pop() !== char) {
        return { valid: false, error: 'Mismatched brackets' };
      }
    }
  }

  if (stack.length > 0) {
    return { valid: false, error: 'Unclosed brackets' };
  }

  return { valid: true };
}

export default {
  generateCodeChange,
  generateCodeChangeWithRetry,
  applyModification,
  analyzeSelector,
  generateCodeFromFigmaStyles,
  validateGeneratedCode
};
