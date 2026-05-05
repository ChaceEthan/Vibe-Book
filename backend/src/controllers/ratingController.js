const User = require("../models/User");

const calculateAverageRating = (user) => {
  if (!user.ratings.length) {
    user.averageRating = 0;
    user.rating = 0;
    return user.averageRating;
  }

  const total = user.ratings.reduce((sum, rating) => sum + rating.value, 0);
  user.averageRating = Math.round((total / user.ratings.length) * 10) / 10;
  user.rating = user.averageRating;
  return user.averageRating;
};

const removeDuplicateRatingsFromUser = (user, ratingToKeep, raterId) => {
  const keepRatingId = ratingToKeep._id.toString();
  const raterIdText = raterId.toString();

  user.ratings = user.ratings.filter((rating) => {
    return rating._id.toString() === keepRatingId || rating.user.toString() !== raterIdText;
  });
};

const addRating = async (req, res, next) => {
  try {
    const { value, comment } = req.body;
    const ratingValue = Number(value);

    if (req.user._id.toString() === req.params.userId) {
      return res.status(400).json({ message: "You cannot rate yourself" });
    }

    if (!Number.isFinite(ratingValue) || ratingValue < 1 || ratingValue > 5) {
      return res.status(400).json({ message: "Rating value must be between 1 and 5" });
    }

    const userToRate = await User.findById(req.params.userId);
    if (!userToRate) {
      return res.status(404).json({ message: "User not found" });
    }

    // One rating per user keeps the average fair. Rating again updates the old rating.
    const existingRating = userToRate.ratings.find(
      (rating) => rating.user.toString() === req.user._id.toString()
    );

    if (existingRating) {
      existingRating.value = ratingValue;
      existingRating.comment = comment || "";
      existingRating.updatedAt = new Date();
      removeDuplicateRatingsFromUser(userToRate, existingRating, req.user._id);
    } else {
      userToRate.ratings.push({
        user: req.user._id,
        value: ratingValue,
        comment: comment || "",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    calculateAverageRating(userToRate);
    await userToRate.save();
    await userToRate.populate("ratings.user", "name role");

    return res.status(existingRating ? 200 : 201).json({
      message: existingRating ? "Rating updated" : "Rating added",
      averageRating: userToRate.averageRating,
      ratings: userToRate.ratings,
    });
  } catch (error) {
    return next(error);
  }
};

const getUserRatings = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.userId)
      .select("name role ratings averageRating")
      .populate("ratings.user", "name role");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      userId: user._id,
      name: user.name,
      role: user.role,
      averageRating: user.averageRating,
      ratings: user.ratings,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  addRating,
  getUserRatings,
  calculateAverageRating,
};
