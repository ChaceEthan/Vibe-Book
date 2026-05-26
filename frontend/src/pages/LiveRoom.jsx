// @ts-nocheck
import { Navigate, useNavigate, useParams } from "react-router-dom";

import LiveStreamViewer from "../components/LiveStreamViewer.jsx";

const LiveRoom = () => {
  const { streamId } = useParams();
  const navigate = useNavigate();

  if (!streamId) {
    return <Navigate to="/" replace />;
  }

  return (
    <LiveStreamViewer
      streamId={streamId}
      onClose={() => navigate("/", { replace: false })}
    />
  );
};

export default LiveRoom;
