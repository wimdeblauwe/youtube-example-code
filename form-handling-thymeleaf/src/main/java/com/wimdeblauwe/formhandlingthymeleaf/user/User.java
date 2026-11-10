package com.wimdeblauwe.formhandlingthymeleaf.user;

import java.util.UUID;

public class User {
    private final UUID id;

    private String givenName;
    private String familyName;

    public User(UUID id, String givenName, String familyName) {
        this.id = id;
        this.givenName = givenName;
        this.familyName = familyName;
    }

    public UUID getId() {
        return id;
    }

    public String getGivenName() {
        return givenName;
    }

    public void setGivenName(String givenName) {
        this.givenName = givenName;
    }

    public String getFamilyName() {
        return familyName;
    }

    public void setFamilyName(String familyName) {
        this.familyName = familyName;
    }
}
