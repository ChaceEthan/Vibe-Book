const express = require("express");

const {
  createGroup,
  getGroupMessages,
  joinGroup,
  leaveGroup,
  listMembers,
  listGroups,
  sendGroupMessage,
} = require("../controllers/groupChatController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware);

const sendMessageFromBody = (req, res, next) => {
  req.params.groupId = req.body.groupId || req.body.group || req.body._id;

  if (!req.params.groupId) {
    return res.status(400).json({ message: "groupId is required" });
  }

  return sendGroupMessage(req, res, next);
};

router.get("/", listGroups);
router.post("/create", createGroup);
router.post("/message", sendMessageFromBody);
router.post("/join/:groupId", joinGroup);
router.post("/leave/:groupId", leaveGroup);
router.get("/:groupId/members", listMembers);
router.get("/:groupId", getGroupMessages);

module.exports = router;
