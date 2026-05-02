/**
 * Click-Ship Figma Plugin - Main Code
 *
 * Runs in Figma's sandbox environment.
 * Handles selection changes and communicates with the UI.
 */

// Show the plugin UI
figma.showUI(__html__, {
  width: 400,
  height: 550,
  themeColors: true,
  title: 'Click-Ship'
});

// ============================================
// Types
// ============================================

interface ExtractedStyles {
  fills: Paint[];
  strokes: Paint[];
  strokeWeight: number;
  cornerRadius: number | PluginAPI['mixed'];
  effects: Effect[];
  opacity: number;
  padding: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  } | null;
  gap: number | null;
  width: number;
  height: number;
  name: string;
  type: string;
}

interface SelectionMessage {
  type: 'selection';
  hasSelection: boolean;
  styles: ExtractedStyles | null;
  nodeName: string | null;
  nodeType: string | null;
}

interface UIMessage {
  type: string;
  [key: string]: any;
}

// ============================================
// Selection Handling
// ============================================

/**
 * Extract styles from a Figma node
 */
function extractStyles(node: SceneNode): ExtractedStyles | null {
  const styles: ExtractedStyles = {
    fills: [],
    strokes: [],
    strokeWeight: 0,
    cornerRadius: 0,
    effects: [],
    opacity: 1,
    padding: null,
    gap: null,
    width: node.width,
    height: node.height,
    name: node.name,
    type: node.type
  };

  // Extract fills
  if ('fills' in node && node.fills !== figma.mixed) {
    styles.fills = node.fills as Paint[];
  }

  // Extract strokes
  if ('strokes' in node) {
    styles.strokes = node.strokes as Paint[];
  }

  // Extract stroke weight
  if ('strokeWeight' in node && node.strokeWeight !== figma.mixed) {
    styles.strokeWeight = node.strokeWeight;
  }

  // Extract corner radius
  if ('cornerRadius' in node) {
    styles.cornerRadius = node.cornerRadius;
  }

  // Extract effects
  if ('effects' in node) {
    styles.effects = node.effects as Effect[];
  }

  // Extract opacity
  if ('opacity' in node) {
    styles.opacity = node.opacity;
  }

  // Extract auto-layout padding
  if (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') {
    const frameNode = node as FrameNode;
    if (frameNode.layoutMode !== 'NONE') {
      styles.padding = {
        top: frameNode.paddingTop,
        right: frameNode.paddingRight,
        bottom: frameNode.paddingBottom,
        left: frameNode.paddingLeft
      };
      styles.gap = frameNode.itemSpacing;
    }
  }

  return styles;
}

/**
 * Handle selection change
 */
function handleSelectionChange() {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    const message: SelectionMessage = {
      type: 'selection',
      hasSelection: false,
      styles: null,
      nodeName: null,
      nodeType: null
    };
    figma.ui.postMessage(message);
    return;
  }

  const node = selection[0];
  const styles = extractStyles(node);

  const message: SelectionMessage = {
    type: 'selection',
    hasSelection: true,
    styles,
    nodeName: node.name,
    nodeType: node.type
  };

  figma.ui.postMessage(message);
}

// Listen for selection changes
figma.on('selectionchange', handleSelectionChange);

// Send initial selection state
handleSelectionChange();

// ============================================
// Message Handling
// ============================================

figma.ui.onmessage = async (msg: UIMessage) => {
  switch (msg.type) {
    case 'get-selection':
      handleSelectionChange();
      break;

    case 'get-user':
      // Get current Figma user info
      const user = figma.currentUser;
      figma.ui.postMessage({
        type: 'user',
        user: user ? {
          id: user.id,
          name: user.name,
          photoUrl: user.photoUrl
        } : null
      });
      break;

    case 'notify':
      // Show a notification
      figma.notify(msg.message, {
        timeout: msg.timeout || 3000,
        error: msg.error || false
      });
      break;

    case 'close':
      figma.closePlugin();
      break;

    case 'resize':
      figma.ui.resize(msg.width || 400, msg.height || 550);
      break;

    case 'highlight-node':
      // Zoom to and select a node by ID
      const nodeToHighlight = figma.currentPage.findOne(n => n.id === msg.nodeId);
      if (nodeToHighlight) {
        figma.currentPage.selection = [nodeToHighlight];
        figma.viewport.scrollAndZoomIntoView([nodeToHighlight]);
      }
      break;

    default:
      console.log('Unknown message type:', msg.type);
  }
};

// ============================================
// Helper Functions
// ============================================

/**
 * Convert Figma color to hex
 */
function rgbToHex(color: RGB): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

/**
 * Get computed styles for CSS export
 */
function getComputedCSS(node: SceneNode): Record<string, string> {
  const css: Record<string, string> = {};

  if ('fills' in node && node.fills !== figma.mixed && Array.isArray(node.fills)) {
    const solidFill = node.fills.find(f => f.type === 'SOLID' && f.visible !== false) as SolidPaint | undefined;
    if (solidFill) {
      css.backgroundColor = rgbToHex(solidFill.color);
      if (solidFill.opacity !== undefined && solidFill.opacity < 1) {
        css.backgroundColor = `rgba(${Math.round(solidFill.color.r * 255)}, ${Math.round(solidFill.color.g * 255)}, ${Math.round(solidFill.color.b * 255)}, ${solidFill.opacity})`;
      }
    }
  }

  if ('cornerRadius' in node && node.cornerRadius !== figma.mixed) {
    css.borderRadius = `${node.cornerRadius}px`;
  }

  if ('strokes' in node && node.strokes.length > 0) {
    const stroke = node.strokes[0] as SolidPaint;
    if (stroke.type === 'SOLID') {
      const strokeWeight = ('strokeWeight' in node && node.strokeWeight !== figma.mixed) ? node.strokeWeight : 1;
      css.border = `${strokeWeight}px solid ${rgbToHex(stroke.color)}`;
    }
  }

  css.width = `${Math.round(node.width)}px`;
  css.height = `${Math.round(node.height)}px`;

  return css;
}
