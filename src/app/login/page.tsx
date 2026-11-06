"use client";
import { useState } from "react";
import { Button, Input, Form, Alert, ConfigProvider } from "antd";
import Link from "next/link";
import Image from "next/image";
import LoginPassword from "@/components/login-password";
export default function Login() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <ConfigProvider theme={{ token: { colorPrimary: "#b3212b" } }}>
      <div className="login">
        <div className="login-brand">
          <Image
            className="login-company-logo"
            src="/luyin-investment-logo.png"
            alt="鲁银投资 LUYIN INVESTMENT"
            width={172}
            height={58}
            preload
            unoptimized
          />
          <h1>
            经营有据
            <br />
            治理有序
          </h1>
          <p>鲁银智能化平台 · 鲁盐集团</p>
          <small>LUYAN INTELLIGENCE</small>
        </div>
        <section>
          <div className="eyebrow">WELCOME BACK</div>
          <h2>登录智能化平台</h2>
          <p>使用已授权的企业账号，进入您的工作空间。</p>
          {error && <Alert type="error" title={error} />}
          <Form
            layout="vertical"
            initialValues={{ email: "admin@luyin.com", password: "admin" }}
            onFinish={async (values) => {
              setBusy(true);
              setError("");
              try {
                const r = await fetch("/api/auth", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(values),
                });
                const d = await r.json();
                if (!r.ok) throw Error(d.error);
                location.href = "/operation";
              } catch (e) {
                setError(e instanceof Error ? e.message : "登录失败");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Form.Item
              name="email"
              label="企业邮箱"
              rules={[{ required: true, type: "email" }]}
            >
              <Input size="large" autoComplete="username" />
            </Form.Item>
            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true }]}
            >
              <LoginPassword />
            </Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={busy}
            >
              登录平台
            </Button>
          </Form>
          <Link href="/operation">返回工作台</Link>
          <p className="muted">
            未配置身份服务时仅可使用明确标识的本地演示空间。
          </p>
        </section>
      </div>
    </ConfigProvider>
  );
}
