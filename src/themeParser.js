// themeParser.js
// Simple XML parser for TWRP theme files (client‑side).
// Provides functions to extract color and image definitions and to rebuild the XML after edits.

// Parse an XML string and return a DOM Document.
function parseXmlString(xmlStr) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlStr, 'application/xml');
  const parsererror = doc.getElementsByTagName('parsererror');
  if (parsererror.length) {
    console.error('XML parsing error', parsererror[0].textContent);
    return null;
  }
  return doc;
}

// Extract <color name="...">value</color> entries.
function extractColors(doc) {
  const colors = {};
  const elems = doc.getElementsByTagName('color');
  for (let el of elems) {
    const name = el.getAttribute('name');
    const value = el.textContent.trim();
    if (name) colors[name] = value;
  }
  return colors;
}

// Extract <image name="..." src="..."/> entries.
function extractImages(doc) {
  const images = {};
  const elems = doc.getElementsByTagName('image');
  for (let el of elems) {
    const name = el.getAttribute('name');
    const src = el.getAttribute('src');
    if (name && src) images[name] = src;
  }
  return images;
}

// Re‑serialize a Document back to XML string.
function serializeDoc(doc) {
  const serializer = new XMLSerializer();
  return serializer.serializeToString(doc);
}

// Update a color value in the Document.
function setColor(doc, name, newValue) {
  const elems = doc.getElementsByTagName('color');
  for (let el of elems) {
    if (el.getAttribute('name') === name) {
      el.textContent = newValue;
      return true;
    }
  }
  return false;
}

// Update an image src attribute.
function setImage(doc, name, newSrc) {
  const elems = doc.getElementsByTagName('image');
  for (let el of elems) {
    if (el.getAttribute('name') === name) {
      el.setAttribute('src', newSrc);
      return true;
    }
  }
  return false;
}

// Export utilities (browser global)
window.ThemeParser = {
  parseXmlString,
  extractColors,
  extractImages,
  serializeDoc,
  setColor,
  setImage,
};
