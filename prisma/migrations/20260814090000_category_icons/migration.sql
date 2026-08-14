ALTER TABLE "categories"
ADD COLUMN "primary_icon" VARCHAR(40) NOT NULL DEFAULT 'folder',
ADD COLUMN "secondary_icon" VARCHAR(40) NOT NULL DEFAULT 'tag';

UPDATE "categories"
SET "primary_icon" = CASE
  WHEN "category1" IN ('餐饮', '吃喝') THEN 'food'
  WHEN "category1" IN ('交通', '出行') THEN 'transport'
  WHEN "category1" IN ('居住', '住房') THEN 'home'
  WHEN "category1" IN ('购物', '消费') THEN 'shopping'
  WHEN "category1" IN ('穿着', '服饰') THEN 'clothing'
  WHEN "category1" IN ('医疗健康', '健康') THEN 'health'
  WHEN "category1" IN ('娱乐', '休闲娱乐') THEN 'entertainment'
  WHEN "category1" IN ('教育', '学习') THEN 'education'
  WHEN "category1" IN ('通讯', '通信') THEN 'phone'
  WHEN "category1" IN ('人情', '礼物') THEN 'gift'
  WHEN "category1" IN ('收入', '工资') THEN 'income'
  WHEN "category1" IN ('借贷', '还款') THEN 'debt'
  WHEN "category1" IN ('旅行', '旅游') THEN 'travel'
  ELSE 'folder'
END;

UPDATE "categories"
SET "secondary_icon" = CASE
  WHEN "category2" LIKE '%饭%' OR "category2" LIKE '%餐%' THEN 'food'
  WHEN "category2" LIKE '%车%' OR "category2" LIKE '%交通%' THEN 'transport'
  WHEN "category2" LIKE '%电费%' OR "category2" LIKE '%水费%' OR "category2" LIKE '%燃气%' THEN 'utilities'
  WHEN "category2" LIKE '%网%' OR "category2" LIKE '%话费%' THEN 'internet'
  WHEN "category2" LIKE '%药%' OR "category2" LIKE '%医疗%' THEN 'health'
  WHEN "category2" LIKE '%衣%' OR "category2" LIKE '%鞋%' THEN 'clothing'
  ELSE 'tag'
END;
