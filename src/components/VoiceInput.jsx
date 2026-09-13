import React from "react";
import { MediaInput } from "./MediaInput";
export function VoiceInput(props) {
  return <MediaInput {...props} kind="voice" />;
}
