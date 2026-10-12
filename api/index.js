const { handleRequest } = require('../website/server/server');

module.exports = async (req, res) => {
  return handleRequest(req, res);
};
