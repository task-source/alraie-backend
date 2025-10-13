import sanitizeHtml from 'sanitize-html';

export const sanitize = (dirtyHtml: string) => {
  return sanitizeHtml(dirtyHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'u']),
    allowedAttributes: {
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height'],
      '*': ['style'], // optionally allow inline styles if you trust admin
    },
    allowedSchemes: ['http', 'https', 'data', 'mailto'],
    // remove script, iframe, etc
  });
};
