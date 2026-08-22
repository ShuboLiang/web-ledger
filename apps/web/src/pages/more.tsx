import {
  ApartmentOutlined,
  RightOutlined,
  RobotOutlined,
  SettingOutlined,
} from "@ant-design/icons"
import { Avatar, Card, List, Typography } from "antd"
import { useNavigate } from "react-router-dom"

const entries = [
  {
    path: "/ai",
    icon: <RobotOutlined />,
    title: "AI 助手",
    description: "自然语言记账、查账和消费分析",
    tone: "gold",
  },
  {
    path: "/settings",
    icon: <SettingOutlined />,
    title: "系统设置",
    description: "配置 AI 模型与数据相关选项",
    tone: "slate",
  },
  {
    path: "/settings/categories",
    icon: <ApartmentOutlined />,
    title: "分类管理",
    description: "维护记账时使用的一级和二级分类",
    tone: "blue",
  },
]

export function MorePage() {
  const navigate = useNavigate()
  return (
    <div className="page-stack more-page">
      <Card className="more-intro">
        <Typography.Title level={4}>其余功能在这里</Typography.Title>
        <Typography.Paragraph type="secondary">
          账目、资金和分析已经在底部。AI、设置和分类从这里进入。
        </Typography.Paragraph>
      </Card>
      <Card styles={{ body: { padding: 0 } }}>
        <List
          dataSource={entries}
          renderItem={(item) => (
            <List.Item
              className="more-entry"
              role="button"
              tabIndex={0}
              onClick={() => navigate(item.path)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ")
                  navigate(item.path)
              }}
              extra={<RightOutlined />}
            >
              <List.Item.Meta
                avatar={
                  <Avatar
                    shape="square"
                    size={46}
                    className={`more-entry-icon ${item.tone}`}
                    icon={item.icon}
                  />
                }
                title={item.title}
                description={item.description}
              />
            </List.Item>
          )}
        />
      </Card>
    </div>
  )
}
