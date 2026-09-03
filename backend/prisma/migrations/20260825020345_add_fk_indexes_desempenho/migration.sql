-- CreateIndex
CREATE INDEX "alerts_userId_idx" ON "alerts"("userId");

-- CreateIndex
CREATE INDEX "areas_propertyId_idx" ON "areas"("propertyId");

-- CreateIndex
CREATE INDEX "devices_areaId_idx" ON "devices"("areaId");

-- CreateIndex
CREATE INDEX "meter_readings_minuteStart_idx" ON "meter_readings"("minuteStart");

-- CreateIndex
CREATE INDEX "properties_userId_idx" ON "properties"("userId");

-- CreateIndex
CREATE INDEX "properties_distributorId_idx" ON "properties"("distributorId");
