// @ts-nocheck
import { getSafeProfileImage, handleAvatarError } from "../utils/profileImage";

const SafeAvatar = ({
  user,
  src = "",
  alt = "",
  className = "",
  loading = "lazy",
  fallbackClassName = "",
  ...props
}) => (
  <img
    src={src || getSafeProfileImage(user)}
    alt={alt}
    className={`${className} ${fallbackClassName}`.trim()}
    loading={loading}
    onError={handleAvatarError}
    {...props}
  />
);

export default SafeAvatar;
