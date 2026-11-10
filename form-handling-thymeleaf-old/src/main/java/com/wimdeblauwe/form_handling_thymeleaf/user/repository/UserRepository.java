package com.wimdeblauwe.form_handling_thymeleaf.user.repository;

import com.wimdeblauwe.form_handling_thymeleaf.user.User;

import java.util.List;

public interface UserRepository {
    void save(User user);

    List<User> findAll();
}
