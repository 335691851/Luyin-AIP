"use client";
import { useState, type ComponentProps } from "react";
import { EyeInvisibleOutlined, EyeOutlined } from "@ant-design/icons";

// Keep the native controlled value intact. AntD's password attribute cleanup
// clears React 19's prefilled field on mount/focus/blur in this project.
export default function LoginPassword(props: ComponentProps<"input">) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="login-password-field">
      <input
        {...props}
        type={visible ? "text" : "password"}
        autoComplete="current-password"
        className="login-password-input"
      />
      <button
        type="button"
        aria-label={visible ? "隐藏密码" : "显示密码"}
        aria-pressed={visible}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setVisible((s) => !s)}
      >
        {visible ? <EyeOutlined /> : <EyeInvisibleOutlined />}
      </button>
    </span>
  );
}
