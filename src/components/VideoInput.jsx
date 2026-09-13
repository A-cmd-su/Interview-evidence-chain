import React from "react";
import { MediaInput } from "./MediaInput";
export function VideoInput(props) {
  return <MediaInput {...props} kind="video" />;
}
