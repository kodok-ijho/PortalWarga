module.exports = async function handler(req, res) {
  const proxy = await import('../../client/api/n8n/[...path].js');
  return proxy.default(req, res);
};
