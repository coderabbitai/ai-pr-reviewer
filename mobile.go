package main

import (
	"fmt"
	"time"
)

// Mobile struct represents a mobile device.
type Mobile struct {
	Brand     string
	Model     string
	IsOn      bool
	Battery   int
	LastUsage time.Time
}

// TurnOn turns on the mobile device.
func (m *Mobile) TurnOn() {
	m.IsOn = true
	m.LastUsage = time.Now()
	fmt.Printf("%s %s is now turned on.\n", m.Brand, m.Model)
}

// TurnOff turns off the mobile device.
func (m *Mobile) TurnOff() {
	m.IsOn = false
	fmt.Printf("%s %s is now turned off.\n", m.Brand, m.Model)
}

// UseMobile simulates the usage of the mobile device.
func (m *Mobile) UseMobile(minutes int) {
	if !m.IsOn {
		fmt.Println("Please turn on the mobile device first.")
		return
	}

	if m.Battery <= 0 {
		fmt.Println("The mobile device is out of battery. Please charge it.")
		return
	}

	m.LastUsage = time.Now()
	fmt.Printf("Using %s %s for %d minutes.\n", m.Brand, m.Model, minutes)

	// Simulate battery drain
	m.Battery -= minutes
	if m.Battery < 0 {
		m.Battery = 0
	}

	// Check battery level
	if m.Battery == 0 {
		m.TurnOff()
		fmt.Println("The mobile device is out of battery. Please charge it.")
	}
}

// ChargeMobile charges the mobile device.
func (m *Mobile) ChargeMobile(minutes int) {
	m.LastUsage = time.Now()
	m.Battery += minutes
	if m.Battery > 100 {
		m.Battery = 100
	}
	fmt.Printf("Charging %s %s for %d minutes.\n", m.Brand, m.Model, minutes)
}

func main() {
	// Create a new mobile device
	myMobile := Mobile{
		Brand:   "Apple",
		Model:   "iPhone X",
		IsOn:    false,
		Battery: 50,
	}

	// Turn on the mobile device
	myMobile.TurnOn()

	// Simulate using the mobile device
	myMobile.UseMobile(60)

	// Charge the mobile device
	myMobile.ChargeMobile(30)

	// Simulate using the mobile device again
	myMobile.UseMobile(120)

	// Turn off the mobile device
	myMobile.TurnOff()
}
