/*
  Warnings:

  - Changed the type of `protocol` on the `iot_device_configs` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "iot_protocol" AS ENUM ('MQTT', 'MODBUS_TCP', 'MODBUS_RTU', 'ETHERNET_IP', 'PROFIBUS', 'PROFINET', 'RS232', 'RS485');

-- AlterTable
ALTER TABLE "iot_device_configs" DROP COLUMN "protocol",
ADD COLUMN     "protocol" "iot_protocol" NOT NULL;
