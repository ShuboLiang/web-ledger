import {
  BankOutlined,
  RightOutlined,
  RobotOutlined,
  SettingOutlined,
  TagsOutlined,
} from "@ant-design/icons"
import { Avatar, Card, List, Typography } from "antd"
import { useNavigate } from "react-router-dom"

const entries = [
  {
    path: "/finance",
    icon: <BankOutlined />,
    title: "资产与负债",
    description: "查看账户额度，管理转账、贷款放款和还款",
    tone: "mint",
  },
  {
    path: "/ai",
    icon: <RobotOutlined />,
    title: "AI 助手",
    description: "自然语言记账、查账和消费分析",
    tone: "mint",
  },
  {
    path: "/tags",
    icon: <TagsOutlined />,
    title: "消费标签",
    description: "按场景、人物或目的查看相关消费",
    tone: "blue",
  },
  {
    path: "/management",
    icon: <TagsOutlined />,
    title: "分类管理",
    description: "维护记账时使用的一级和二级分类",
    tone: "blue",
  },
  {
    path: "/settings",
    icon: <SettingOutlined />,
    title: "系统设置",
    description: "配置 AI 模型与数据相关选项",
    tone: "slate",
  },
]

export function MorePage() {
  const navigate = useNavigate()
  return (
    <div className="page-stack more-page">
      <Card className="more-intro">
        <Typography.Title level={4}>所有功能，都能从这里到达</Typography.Title>
        <Typography.Paragraph type="secondary">
          常用功能在底部就能进；资产、标签、分类和设置集中在这里。
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
